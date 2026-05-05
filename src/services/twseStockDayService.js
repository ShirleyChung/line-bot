// services/twseStockDayService.js

function yyyymmddTaipei(date = new Date()) {
  // Cloud Run 可能是 UTC，所以用 Asia/Taipei 產生台灣日期
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;

  return `${y}${m}${d}`;
}

function parseTwseNumber(value) {
  if (value == null) return null;

  const s = String(value)
    .replace(/,/g, "")
    .replace(/X/g, "")
    .trim();

  if (s === "" || s === "--") return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseTwseSignNumber(value) {
  if (value == null) return null;

  const s = String(value)
    .replace(/,/g, "")
    .replace(/X/g, "")
    .replace(/\+/g, "")
    .trim();

  if (s === "" || s === "--") return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function convertRocDateToAd(rocDate) {
  // TWSE data 日期通常是這樣：115/05/05
  const parts = String(rocDate).split("/");
  if (parts.length !== 3) return rocDate;

  const rocYear = Number(parts[0]);
  if (!Number.isFinite(rocYear)) return rocDate;

  const year = rocYear + 1911;
  return `${year}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
}

function getFieldIndex(fields, names) {
  for (const name of names) {
    const idx = fields.indexOf(name);
    if (idx >= 0) return idx;
  }
  return -1;
}

function normalizeTwseStockDayRow(fields, row, symbol, title = "") {
  const dateIdx = getFieldIndex(fields, ["日期"]);
  const volumeIdx = getFieldIndex(fields, ["成交股數"]);
  const amountIdx = getFieldIndex(fields, ["成交金額"]);
  const openIdx = getFieldIndex(fields, ["開盤價"]);
  const highIdx = getFieldIndex(fields, ["最高價"]);
  const lowIdx = getFieldIndex(fields, ["最低價"]);
  const closeIdx = getFieldIndex(fields, ["收盤價"]);
  const changeIdx = getFieldIndex(fields, ["漲跌價差"]);
  const txIdx = getFieldIndex(fields, ["成交筆數"]);

  const rawDate = dateIdx >= 0 ? row[dateIdx] : "";

  return {
    symbol,
    name: extractStockNameFromTitle(title, symbol),
    date: convertRocDateToAd(rawDate),
    rawDate,

    open: openIdx >= 0 ? parseTwseNumber(row[openIdx]) : null,
    high: highIdx >= 0 ? parseTwseNumber(row[highIdx]) : null,
    low: lowIdx >= 0 ? parseTwseNumber(row[lowIdx]) : null,
    close: closeIdx >= 0 ? parseTwseNumber(row[closeIdx]) : null,
    change: changeIdx >= 0 ? parseTwseSignNumber(row[changeIdx]) : null,

    volume: volumeIdx >= 0 ? parseTwseNumber(row[volumeIdx]) : null,
    amount: amountIdx >= 0 ? parseTwseNumber(row[amountIdx]) : null,
    transactionCount: txIdx >= 0 ? parseTwseNumber(row[txIdx]) : null,

    source: "TWSE_STOCK_DAY",
    priceType: "daily_close",
    found: true,
  };
}

function extractStockNameFromTitle(title, symbol) {
  const s = String(title || "").replace(/\s+/g, " ").trim();
  const code = String(symbol || "").trim();

  const pattern = new RegExp(`${code}\\s+(.+?)\\s+各日成交資訊`);
  const m = s.match(pattern);

  return m ? m[1].trim() : "";
}

const twseStockDayCache = new Map();
const TWSE_STOCK_DAY_CACHE_TTL_MS = 60 * 1000;

export async function fetchTwseStockDay(symbol, dateYmd = yyyymmddTaipei()) {
  const code = String(symbol).trim();

  const cacheKey = `${code}:${dateYmd}`;
  const now = Date.now();

  const cached = twseStockDayCache.get(cacheKey);
  if (cached && now - cached.cachedAt < TWSE_STOCK_DAY_CACHE_TTL_MS) {
    return cached.data;
  }

  const url =
    "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY" +
    `?date=${encodeURIComponent(dateYmd)}` +
    `&stockNo=${encodeURIComponent(code)}` +
    `&response=json`;

  console.log("[fetchTwseStockDay] url =", url);

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json,text/plain,*/*",
      "User-Agent": "Mozilla/5.0 CloudRun-LineBot/1.0",
      "Referer": "https://www.twse.com.tw/zh/trading/historical/stock-day.html",
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`TWSE STOCK_DAY failed: HTTP ${res.status}, body=${text.slice(0, 200)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    console.error("[fetchTwseStockDay] JSON parse failed:", err);
    throw new Error(`TWSE 回傳內容不是 JSON：${text.slice(0, 200)}`);
  }

  twseStockDayCache.set(cacheKey, {
    cachedAt: now,
    data: json,
  });

  return json;
}

export async function fetchTwseLatestClose(symbol, dateYmd = yyyymmddTaipei()) {
  const code = String(symbol).trim();

  const json = await fetchTwseStockDay(code, dateYmd);

  if (!json || json.stat !== "OK") {
    return {
      symbol: code,
      found: false,
      source: "TWSE_STOCK_DAY",
      message: json?.stat || "TWSE 查詢失敗",
      raw: json,
    };
  }

  const fields = json.fields || [];
  const data = json.data || [];

  if (!Array.isArray(data) || data.length === 0) {
    return {
      symbol: code,
      found: false,
      source: "TWSE_STOCK_DAY",
      message: "查無資料，可能是非上市股票、停盤日、休市日，或該標的本月份尚無交易資料。",      raw: json,
    };
  }

  // STOCK_DAY 查的是某月「每日收盤行情」
  // 所以最後一筆通常就是某月目前最新的一筆
  const latestRow = data[data.length - 1];

  return normalizeTwseStockDayRow(
    fields,
    latestRow,
    code,
    json.title || ""
  );
}