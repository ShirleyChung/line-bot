// services/tpexStockService.js

function yyyymmddTaipei(date = new Date()) {
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

function yyyymmddToSlash(dateYmd) {
  const s = String(dateYmd || yyyymmddTaipei()).replace(/\D/g, "");
  if (s.length !== 8) return String(dateYmd || "");
  return `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)}`;
}

function parseTpexNumber(value) {
  if (value == null) return null;

  const s = String(value)
    .replace(/,/g, "")
    .replace(/\+/g, "")
    .trim();

  if (s === "" || s === "---" || s === "--" || s === "-") return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function multiplyNumber(value, multiplier) {
  const n = parseTpexNumber(value);
  return n == null ? null : n * multiplier;
}

function convertRocDateToAd(rocDate) {
  const parts = String(rocDate || "").split("/");
  if (parts.length !== 3) return rocDate;

  const rocYear = Number(parts[0]);
  if (!Number.isFinite(rocYear)) return rocDate;

  const year = rocYear + 1911;
  return `${year}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
}

function convertRocDateTimeToAd(rocDateTime) {
  const match = String(rocDateTime || "").match(/^(\d+)年(\d{1,2})月(\d{1,2})日/);
  if (!match) return rocDateTime;

  const year = Number(match[1]) + 1911;
  return `${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function getFieldIndex(fields, names) {
  for (const name of names) {
    const idx = fields.indexOf(name);
    if (idx >= 0) return idx;
  }
  return -1;
}

const TPEX_CACHE_TTL_MS = 60 * 1000;
const tpexCache = new Map();

const TPEX_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": "https://www.tpex.org.tw/zh-tw/",
  "Origin": "https://www.tpex.org.tw",
};

async function fetchTpexJson(cacheKey, url) {
  const now = Date.now();
  const cached = tpexCache.get(cacheKey);
  if (cached && now - cached.cachedAt < TPEX_CACHE_TTL_MS) {
    return cached.data;
  }

  console.log("[fetchTpexJson] url =", url);

  const res = await fetch(url, {
    headers: TPEX_HEADERS,
    redirect: "follow",
  });
  const text = await res.text();

  console.log("[fetchTpexJson] status =", res.status);
  console.log("[fetchTpexJson] content-type =", res.headers.get("content-type"));
  console.log("[fetchTpexJson] body first 300 =", text.slice(0, 300));

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}, body=${text.slice(0, 300)}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`TPEx 回傳內容不是 JSON：${text.slice(0, 300)}`);
  }

  tpexCache.set(cacheKey, {
    cachedAt: now,
    data: json,
  });

  return json;
}

function normalizeTpexListedRow(fields, row, symbol, name) {
  const dateIdx = getFieldIndex(fields, ["日 期", "日期"]);
  const volumeIdx = getFieldIndex(fields, ["成交張數"]);
  const amountIdx = getFieldIndex(fields, ["成交仟元"]);
  const openIdx = getFieldIndex(fields, ["開盤"]);
  const highIdx = getFieldIndex(fields, ["最高"]);
  const lowIdx = getFieldIndex(fields, ["最低"]);
  const closeIdx = getFieldIndex(fields, ["收盤"]);
  const changeIdx = getFieldIndex(fields, ["漲跌"]);
  const txIdx = getFieldIndex(fields, ["筆數"]);

  return {
    symbol,
    name: name || "",
    market: "TPEX",
    date: convertRocDateToAd(dateIdx >= 0 ? row[dateIdx] : ""),
    rawDate: dateIdx >= 0 ? row[dateIdx] : "",

    open: openIdx >= 0 ? parseTpexNumber(row[openIdx]) : null,
    high: highIdx >= 0 ? parseTpexNumber(row[highIdx]) : null,
    low: lowIdx >= 0 ? parseTpexNumber(row[lowIdx]) : null,
    close: closeIdx >= 0 ? parseTpexNumber(row[closeIdx]) : null,
    change: changeIdx >= 0 ? parseTpexNumber(row[changeIdx]) : null,

    volume: volumeIdx >= 0 ? multiplyNumber(row[volumeIdx], 1000) : null,
    amount: amountIdx >= 0 ? multiplyNumber(row[amountIdx], 1000) : null,
    transactionCount: txIdx >= 0 ? parseTpexNumber(row[txIdx]) : null,

    source: "TPEX_TRADING_STOCK",
    priceType: "daily_close",
    found: true,
  };
}

function normalizeTpexEmergingRow(fields, row, symbol, name) {
  const dateIdx = getFieldIndex(fields, ["日期"]);
  const volumeIdx = getFieldIndex(fields, ["成交股數"]);
  const amountIdx = getFieldIndex(fields, ["成交金額(元)"]);
  const highIdx = getFieldIndex(fields, ["成交最高"]);
  const lowIdx = getFieldIndex(fields, ["成交最低"]);
  const avgIdx = getFieldIndex(fields, ["成交均價"]);
  const txIdx = getFieldIndex(fields, ["筆數"]);

  return {
    symbol,
    name: name || "",
    market: "TPEX_ESB",
    date: convertRocDateToAd(dateIdx >= 0 ? row[dateIdx] : ""),
    rawDate: dateIdx >= 0 ? row[dateIdx] : "",

    open: null,
    high: highIdx >= 0 ? parseTpexNumber(row[highIdx]) : null,
    low: lowIdx >= 0 ? parseTpexNumber(row[lowIdx]) : null,
    close: avgIdx >= 0 ? parseTpexNumber(row[avgIdx]) : null,
    change: null,

    volume: volumeIdx >= 0 ? parseTpexNumber(row[volumeIdx]) : null,
    amount: amountIdx >= 0 ? parseTpexNumber(row[amountIdx]) : null,
    transactionCount: txIdx >= 0 ? parseTpexNumber(row[txIdx]) : null,

    source: "TPEX_EMERGING_HISTORICAL",
    priceType: "daily_average",
    found: true,
  };
}

function normalizeTpexEmergingLatestRow(fields, row, symbol, rawDate) {
  const codeIdx = getFieldIndex(fields, ["代號"]);
  const nameIdx = getFieldIndex(fields, ["名稱"]);
  const prevAvgIdx = getFieldIndex(fields, ["前日均價"]);
  const highIdx = getFieldIndex(fields, ["日最高"]);
  const lowIdx = getFieldIndex(fields, ["日最低"]);
  const avgIdx = getFieldIndex(fields, ["日均價"]);
  const tradeIdx = getFieldIndex(fields, ["成交"]);
  const volumeIdx = getFieldIndex(fields, ["成交量"]);

  const avgPrice = avgIdx >= 0 ? parseTpexNumber(row[avgIdx]) : null;
  const prevAvgPrice = prevAvgIdx >= 0 ? parseTpexNumber(row[prevAvgIdx]) : null;
  const latestTrade = tradeIdx >= 0 ? parseTpexNumber(row[tradeIdx]) : null;

  return {
    symbol: codeIdx >= 0 ? String(row[codeIdx] || symbol).trim().toUpperCase() : symbol,
    name: nameIdx >= 0 ? String(row[nameIdx] || "").trim() : "",
    market: "TPEX_ESB",
    date: convertRocDateTimeToAd(rawDate),
    rawDate,

    open: null,
    high: highIdx >= 0 ? parseTpexNumber(row[highIdx]) : null,
    low: lowIdx >= 0 ? parseTpexNumber(row[lowIdx]) : null,
    close: avgPrice ?? latestTrade,
    change: avgPrice != null && prevAvgPrice != null ? avgPrice - prevAvgPrice : null,
    latestTrade,

    volume: volumeIdx >= 0 ? parseTpexNumber(row[volumeIdx]) : null,
    amount: null,
    transactionCount: null,

    source: "TPEX_EMERGING_LATEST",
    priceType: "daily_average",
    found: true,
  };
}

export async function fetchTpexListedLatestClose(symbol, dateYmd = yyyymmddTaipei()) {
  const code = String(symbol).trim().toUpperCase();
  const date = yyyymmddToSlash(dateYmd);
  const url =
    "https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock" +
    `?date=${encodeURIComponent(date)}` +
    `&code=${encodeURIComponent(code)}` +
    "&response=json";

  const json = await fetchTpexJson(`listed:${code}:${date}`, url);

  if (!json || json.stat !== "ok") {
    return {
      symbol: code,
      found: false,
      source: "TPEX_TRADING_STOCK",
      message: json?.stat || "TPEx 上櫃查詢失敗",
      raw: json,
    };
  }

  const table = Array.isArray(json.tables) ? json.tables[0] : null;
  const data = Array.isArray(table?.data) ? table.data : [];

  if (data.length === 0) {
    return {
      symbol: code,
      found: false,
      source: "TPEX_TRADING_STOCK",
      message: json?.stat || "查無上櫃資料。",
      raw: json,
    };
  }

  return normalizeTpexListedRow(table.fields || [], data[data.length - 1], code, json.name || "");
}

export async function fetchTpexEmergingLatestAverage(symbol, dateYmd = yyyymmddTaipei()) {
  const code = String(symbol).trim().toUpperCase();

  try {
    const latest = await fetchTpexEmergingLatestQuote(code);
    if (latest.found) {
      return latest;
    }
  } catch (err) {
    console.warn("[fetchTpexEmergingLatestAverage] latest quote failed:", code, err);
  }

  const date = yyyymmddToSlash(dateYmd);
  const url =
    "https://www.tpex.org.tw/www/zh-tw/emerging/historical" +
    `?date=${encodeURIComponent(date)}` +
    `&code=${encodeURIComponent(code)}` +
    "&type=Monthly" +
    "&response=json";

  const json = await fetchTpexJson(`emerging:${code}:${date}`, url);
  const table = Array.isArray(json?.tables) ? json.tables[0] : null;
  const data = Array.isArray(table?.data) ? table.data : [];

  if (!json || json.stat !== "ok" || data.length === 0) {
    return {
      symbol: code,
      found: false,
      source: "TPEX_EMERGING_HISTORICAL",
      message: json?.stat || "查無興櫃資料。",
      raw: json,
    };
  }

  const subtitle = String(table.subtitle || "");
  const name = subtitle.replace(new RegExp(`^.*?\\s${code}\\s*`), "").trim();

  return normalizeTpexEmergingRow(table.fields || [], data[data.length - 1], code, name);
}

export async function fetchTpexEmergingLatestQuote(symbol) {
  const code = String(symbol).trim().toUpperCase();
  const url = "https://www.tpex.org.tw/www/zh-tw/emerging/latest?response=json";
  const json = await fetchTpexJson("emerging:latest", url);

  if (!json || json.stat !== "ok") {
    return {
      symbol: code,
      found: false,
      source: "TPEX_EMERGING_LATEST",
      message: json?.stat || "TPEx 興櫃最新行情查詢失敗",
      raw: json,
    };
  }

  const table = Array.isArray(json.tables) ? json.tables[0] : null;
  const fields = table?.fields || [];
  const codeIdx = getFieldIndex(fields, ["代號"]);
  const data = Array.isArray(table?.data) ? table.data : [];
  const row = data.find((item) => String(item?.[codeIdx] || "").trim().toUpperCase() === code);

  if (!row) {
    return {
      symbol: code,
      found: false,
      source: "TPEX_EMERGING_LATEST",
      message: "查無興櫃最新行情。",
      raw: json,
    };
  }

  return normalizeTpexEmergingLatestRow(fields, row, code, table.date || json.date || "");
}
