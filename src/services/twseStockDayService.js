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

  // TWSE 數字欄位常帶逗號、X 或 --，先清掉再轉 Number。
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

function parseTwseRatio(value) {
  if (value == null) return null;

  const s = String(value)
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim();

  if (s === "" || s === "-" || s === "--" || s === "N/A") return null;

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
  // TWSE 欄位名稱有時會調整順序，所以先用欄名找 index，避免依賴固定欄位位置。
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
const twseBasicInfoCache = new Map();
const TWSE_STOCK_DAY_CACHE_TTL_MS = 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TWSE_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": "https://www.twse.com.tw/zh/trading/historical/stock-day.html",
  "Origin": "https://www.twse.com.tw",
};

async function fetchJsonWithText(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    redirect: "follow",
  });

  const text = await res.text();

  console.log("[fetchJsonWithText] status =", res.status);
  console.log("[fetchJsonWithText] content-type =", res.headers.get("content-type"));
  console.log("[fetchJsonWithText] body first 300 =", text.slice(0, 300));

  if (!res.ok) {
    const err = new Error(
      `HTTP ${res.status}, body=${text.slice(0, 300)}`
    );
    err.status = res.status;
    err.body = text;
    throw err;
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`回傳內容不是 JSON：${text.slice(0, 300)}`);
  }
}

export async function fetchTwseStockDay(symbol, dateYmd = yyyymmddTaipei()) {
  const code = String(symbol).trim().toUpperCase();

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
    "&response=json";

  console.log("[fetchTwseStockDay] url =", url);

  let lastErr = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log("[fetchTwseStockDay] attempt =", attempt);

      const json = await fetchJsonWithText(url, {
        headers: TWSE_HEADERS,
      });

      console.log("[fetchTwseStockDay] json.stat =", json.stat);
      console.log("[fetchTwseStockDay] json.title =", json.title);
      console.log("[fetchTwseStockDay] data length =", Array.isArray(json.data) ? json.data.length : "not array");

      twseStockDayCache.set(cacheKey, {
        cachedAt: now,
        data: json,
      });

      return json;
    } catch (err) {
      lastErr = err;

      console.error("[fetchTwseStockDay] attempt failed:", attempt, err.message);

      // TWSE WAF / 307 / 403 / HTML 異常，稍等再試
      await sleep(300 * attempt);
    }
  }

  throw lastErr;
}

async function fetchTwseDailyBasicInfo(dateYmd = yyyymmddTaipei()) {
  const cacheKey = `basic:${dateYmd}`;
  const now = Date.now();

  const cached = twseBasicInfoCache.get(cacheKey);
  if (cached && now - cached.cachedAt < TWSE_STOCK_DAY_CACHE_TTL_MS) {
    return cached.data;
  }

  const url =
    "https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d" +
    `?date=${encodeURIComponent(dateYmd)}` +
    "&selectType=ALL" +
    "&response=json";

  console.log("[fetchTwseDailyBasicInfo] url =", url);

  const json = await fetchJsonWithText(url, {
    headers: TWSE_HEADERS,
  });

  twseBasicInfoCache.set(cacheKey, {
    cachedAt: now,
    data: json,
  });

  return json;
}

function normalizeTwseBasicInfoRow(fields, row, close) {
  const dividendYieldIdx = getFieldIndex(fields, ["殖利率(%)", "殖利率"]);
  const dividendYearIdx = getFieldIndex(fields, ["股利年度"]);
  const peIdx = getFieldIndex(fields, ["本益比"]);
  const pbIdx = getFieldIndex(fields, ["股價淨值比"]);
  const fiscalPeriodIdx = getFieldIndex(fields, ["財報年/季"]);

  const dividendYield = dividendYieldIdx >= 0 ? parseTwseRatio(row[dividendYieldIdx]) : null;
  const peRatio = peIdx >= 0 ? parseTwseRatio(row[peIdx]) : null;
  const closePrice = Number(close);
  // TWSE BWIBBU_d 沒有直接給 EPS，這裡用收盤價 / 本益比估算，並以 epsEstimated 標記。
  const eps = Number.isFinite(closePrice) && peRatio != null && peRatio > 0
    ? closePrice / peRatio
    : null;

  return {
    eps,
    epsEstimated: eps != null,
    dividendYield,
    dividendYear: dividendYearIdx >= 0 ? String(row[dividendYearIdx] || "").trim() : "",
    peRatio,
    pbRatio: pbIdx >= 0 ? parseTwseRatio(row[pbIdx]) : null,
    fiscalPeriod: fiscalPeriodIdx >= 0 ? String(row[fiscalPeriodIdx] || "").trim() : "",
    source: "TWSE BWIBBU_d",
  };
}

async function fetchTwseBasicInfo(symbol, close, dateYmd = yyyymmddTaipei()) {
  const code = String(symbol).trim().toUpperCase();
  const json = await fetchTwseDailyBasicInfo(dateYmd);

  if (!json || json.stat !== "OK") {
    throw new Error(json?.stat || "TWSE 基本資料查詢失敗");
  }

  const fields = json.fields || [];
  const codeIdx = getFieldIndex(fields, ["證券代號"]);
  const data = Array.isArray(json.data) ? json.data : [];
  const row = data.find((item) => String(item?.[codeIdx] || "").trim().toUpperCase() === code);

  if (!row) {
    return null;
  }

  return normalizeTwseBasicInfoRow(fields, row, close);
}

export async function fetchTwseLatestClose(symbol, dateYmd = yyyymmddTaipei()) {
  console.log("[fetchTwseLatestClose] symbol =", symbol, "dateYmd =", dateYmd);

  const code = String(symbol).trim().toUpperCase();

  let json;

  try {
    json = await fetchTwseStockDay(code, dateYmd);
  } catch (err) {
    console.error("[fetchTwseLatestClose] TWSE fetch failed:", code, err);

    return {
      symbol: code,
      found: false,
      source: "TWSE_STOCK_DAY",
      message:
        "TWSE 查詢暫時失敗，可能被官網安全機制擋下，請稍後再試。",
      error: err instanceof Error ? err.message : String(err),
    };
  }

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
      message: "查無資料，可能是非上市股票、停盤日、休市日，或該標的本月份尚無交易資料。",
      raw: json,
    };
  }

  const latestRow = data[data.length - 1];

  const price = normalizeTwseStockDayRow(
    fields,
    latestRow,
    code,
    json.title || ""
  );

  try {
    const basicInfoDate = String(price.date || "").replace(/-/g, "") || dateYmd;
    // 基本面資料是加值資訊，失敗時不影響主要股價回覆。
    price.fundamentals = await fetchTwseBasicInfo(code, price.close, basicInfoDate);
  } catch (err) {
    console.warn("[fetchTwseLatestClose] basic info failed:", code, err);
    price.fundamentals = null;
  }

  return price;
}
