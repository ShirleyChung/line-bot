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
  // TWSE data 日期通常長這樣：115/05/05
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
  // 常見 title 類似：115年05月 2330 台積電 各日成交資訊
  if (!title) return "";

  const s = String(title);
  const idx = s.indexOf(symbol);
  if (idx < 0) return "";

  const after = s.slice(idx + symbol.length).trim();
  const m = after.match(/^(.+?)\s+各日成交資訊/);

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

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json,text/plain,*/*",
      "User-Agent": "Mozilla/5.0 CloudRun-LineBot/1.0",
      "Referer": "https://www.twse.com.tw/zh/trading/historical/stock-day.html",
    },
  });

  if (!res.ok) {
    throw new Error(`TWSE STOCK_DAY failed: ${res.status}`);
  }

  const json = await res.json();

  twseStockDayCache.set(cacheKey, {
    cachedAt: now,
    data: json,
  });

  return json;
}

export async function fetchTwseLatestClose(symbol, dateYmd = yyyymmddTaipei()) {
  console.log("[fetchTwseLatestClose] symbol =", symbol, "dateYmd =", dateYmd);
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
      message: "查無資料，可能是非上市股票、休市日、或該月份尚無交易資料。",
      raw: json,
    };
  }

  // STOCK_DAY 是查「該月份各日成交資訊」
  // 所以最後一筆通常就是該月份目前最新交易日
  const latestRow = data[data.length - 1];

  return normalizeTwseStockDayRow(
    fields,
    latestRow,
    code,
    json.title || ""
  );
}