// services/yahooFuturesService.js
//
// 從 Yahoo 奇摩股市 (tw.stock.yahoo.com/future/<symbol>) 抓單一期貨契約報價。
// Yahoo 頁面把 redux state 內嵌在 HTML 裡，這裡用字串擷取拿到 QuoteHeader 區段，
// 再把 OHLC、漲跌、未平倉等欄位整理出來。
//
// Yahoo 的 regularMarketTime 是 UTC，會跨到下個交易日 04:59:59Z（=台北 12:59:59）。
// 實際上夜盤收盤是台北 05:00，所以資料若顯示 20:59:59Z 代表「今天收完的夜盤」、
// 13:45 台北那筆是一般盤收盤。回傳前都換成 Asia/Taipei 字串方便顯示。

const YAHOO_FUTURES_URL = "https://tw.stock.yahoo.com/future/";

const YAHOO_HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

const cache = new Map();
const CACHE_TTL_MS = 30 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNumber(value) {
  if (value == null || value === "" || value === "-") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function extractRaw(html, key) {
  // 抓 "key":{"raw":"123.4","fmt":"..."} 裡的 raw 數字
  const re = new RegExp(`"${key}":\\{"raw":"([^"]+)"`);
  const m = html.match(re);
  return m ? parseNumber(m[1]) : null;
}

function extractString(html, key) {
  const re = new RegExp(`"${key}":"([^"]+)"`);
  const m = html.match(re);
  return m ? m[1] : null;
}

function isoToTaipei(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function classifySession(iso) {
  // Yahoo 把日盤 + 夜盤合在同一個「regularMarket」欄位。
  // 用收盤時間推一下：13:45 收 → 一般盤；近 05:00 / 04:59 → 夜盤；其他時段視為盤中。
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hh = Number(parts.find((p) => p.type === "hour")?.value);
  const mm = Number(parts.find((p) => p.type === "minute")?.value);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  const total = hh * 60 + mm;
  if (total >= 8 * 60 + 45 && total <= 13 * 60 + 45) return "一般盤";
  if (total >= 15 * 60 || total <= 5 * 60) return "夜盤";
  return "盤中";
}

async function fetchYahooFutureHtml(yahooSymbol) {
  // Yahoo URL 裡的 & / @ 不能 encode，所以手動拼字串。
  const url = `${YAHOO_FUTURES_URL}${yahooSymbol}`;
  console.log("[yahooFutures] url =", url);

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: YAHOO_HEADERS,
        redirect: "follow",
      });
      if (res.status === 404) {
        // 404 通常代表契約不存在或已下市，重試也救不回來
        const err = new Error("查無此期貨契約，可能契約已到期或代碼錯誤。");
        err.status = 404;
        throw err;
      }
      if (!res.ok) {
        throw new Error(`Yahoo 期貨頁回應 HTTP ${res.status}`);
      }
      const html = await res.text();
      if (html.length < 1000) {
        throw new Error("Yahoo 期貨頁回傳內容過短，可能被阻擋");
      }
      return html;
    } catch (err) {
      lastErr = err;
      console.warn("[yahooFutures] attempt failed:", attempt, err.message);
      if (err.status === 404) break;
      await sleep(300 * attempt);
    }
  }
  throw lastErr;
}

export async function fetchYahooFuturesQuote(yahooSymbol) {
  const symbol = String(yahooSymbol).trim();
  if (!symbol) {
    return { found: false, message: "缺少期貨代碼" };
  }

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  let html;
  try {
    html = await fetchYahooFutureHtml(symbol);
  } catch (err) {
    return {
      symbol,
      found: false,
      source: "YAHOO_TW_FUTURES",
      message: `Yahoo 期貨查詢失敗：${err.message}`,
    };
  }

  // QuoteHeader 區段才是當前主要報價，要篩到包含 "regularMarketTime" 的那一段
  // 用 openInterest 當錨點，往前往後切出夠長的 JSON 區段。
  const anchorIdx = html.indexOf(`"symbol":"${symbol}"`);
  if (anchorIdx < 0) {
    return {
      symbol,
      found: false,
      source: "YAHOO_TW_FUTURES",
      message: "查無此期貨契約，請確認代碼是否正確。",
    };
  }

  // 把錨點前後一段抓出來解析
  const start = Math.max(0, anchorIdx - 2500);
  const end = Math.min(html.length, anchorIdx + 2500);
  const segment = html.slice(start, end);

  const name = extractString(segment, "symbolName") || symbol;
  const sector = extractString(segment, "sectorName") || "";
  const time = extractString(segment, "regularMarketTime");
  const marketStatus = extractString(segment, "marketStatus");

  const price = extractRaw(segment, "price");
  const open = extractRaw(segment, "regularMarketOpen");
  const high = extractRaw(segment, "regularMarketDayHigh");
  const low = extractRaw(segment, "regularMarketDayLow");
  const previousClose = extractRaw(segment, "regularMarketPreviousClose");
  const change = extractRaw(segment, "change");
  const openInterest = parseNumber(extractString(segment, "openInterest"));
  const volume = parseNumber(extractString(segment, "volume"));
  const changePercent = extractString(segment, "changePercent");

  if (price == null) {
    return {
      symbol,
      found: false,
      source: "YAHOO_TW_FUTURES",
      message: "Yahoo 期貨頁面結構可能變動，暫時讀不到報價。",
    };
  }

  const data = {
    symbol,
    name,
    sector,
    found: true,
    source: "YAHOO_TW_FUTURES",
    close: price,
    open,
    high,
    low,
    previousClose,
    change,
    changePercent,
    volume,
    openInterest,
    time: isoToTaipei(time),
    rawTime: time,
    session: classifySession(time),
    marketStatus,
  };

  cache.set(symbol, { at: Date.now(), data });
  return data;
}
