// services/finnhubService.js
import { env } from "../config/env.js";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

const finnhubCache = new Map();
const FINNHUB_CACHE_TTL_MS = 60 * 1000;

/**
 * Finnhub 查詢集中放在這個 service：
 * 報價、公司名稱與基本面資料分開抓，最後再組成 bot 需要的統一價格格式。
 * @returns {string} Finnhub API key
 */
function getFinnhubApiKey() {
  const apiKey = env.FINNHUB_API_KEY;

  if (!apiKey) {
    throw new Error("缺少 FINNHUB_API_KEY 環境變數");
  }

  return apiKey;
}

/**
 * 正規化美股代碼
 * @param {string} symbol - 股票代碼
 * @returns {string} 正規化後的代碼
 */
function normalizeUsSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

/**
 * 呼叫 Finnhub API
 * @param {string} path - API 路徑
 * @param {object} params - 查詢參數
 * @returns {Promise<object>} API 回應
 */
async function fetchFinnhubJson(path, params = {}) {
  const apiKey = getFinnhubApiKey();

  const url = new URL(`${FINNHUB_BASE_URL}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set("token", apiKey);

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(
      `Finnhub API failed: HTTP ${res.status}, body=${text.slice(0, 300)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Finnhub 回傳內容不是 JSON：${text.slice(0, 300)}`);
  }
}

/**
 * 帶快取的 Finnhub 查詢
 * @param {string} cacheKey - 快取鍵值
 * @param {Function} fetcher - 資料擷取函式
 * @returns {Promise<object>} API 回應
 */
async function fetchFinnhubCached(cacheKey, fetcher) {
  const now = Date.now();

  const cached = finnhubCache.get(cacheKey);
  if (cached && now - cached.cachedAt < FINNHUB_CACHE_TTL_MS) {
    return cached.data;
  }

  const data = await fetcher();

  finnhubCache.set(cacheKey, {
    cachedAt: now,
    data,
  });

  return data;
}

/**
 * 查詢美股即時報價
 * @param {string} symbol - 股票代碼
 * @returns {Promise<object>} 報價資料
 */
export async function fetchFinnhubQuote(symbol) {
  const code = normalizeUsSymbol(symbol);

  return fetchFinnhubCached(`quote:${code}`, () =>
    fetchFinnhubJson("/quote", {
      symbol: code,
    })
  );
}

/**
 * 查詢公司基本資料
 * @param {string} symbol - 股票代碼
 * @returns {Promise<object>} 公司資料
 */
export async function fetchFinnhubProfile(symbol) {
  const code = normalizeUsSymbol(symbol);

  return fetchFinnhubCached(`profile:${code}`, () =>
    fetchFinnhubJson("/stock/profile2", {
      symbol: code,
    })
  );
}

/**
 * 查詢財務指標
 * @param {string} symbol - 股票代碼
 * @returns {Promise<object>} 財務指標資料
 */
export async function fetchFinnhubMetric(symbol) {
  const code = normalizeUsSymbol(symbol);

  return fetchFinnhubCached(`metric:${code}`, () =>
    fetchFinnhubJson("/stock/metric", {
      symbol: code,
      metric: "all",
    })
  );
}

/**
 * 從多個鍵值中挑選第一個有限數值
 * @param {object} source - 來源物件
 * @param {Array<string>} keys - 鍵值陣列
 * @returns {number|null} 數值或 null
 */
function pickFiniteNumber(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * 正規化 Finnhub 基本面資料
 * @param {object} metricResponse - Finnhub metric API 回應
 * @returns {object} 正規化後的基本面資料
 */
function normalizeFinnhubFundamentals(metricResponse) {
  const metric = metricResponse?.metric || {};

  return {
    eps: pickFiniteNumber(metric, [
      "epsTTM",
      "epsBasicExclExtraItemsTTM",
      "epsNormalizedAnnual",
      "epsInclExtraItemsTTM",
    ]),
    dividendYield: pickFiniteNumber(metric, [
      "dividendYieldIndicatedAnnual",
      "dividendYield5Y",
    ]),
    peRatio: pickFiniteNumber(metric, [
      "peTTM",
      "peBasicExclExtraTTM",
    ]),
    pbRatio: pickFiniteNumber(metric, [
      "pbAnnual",
      "pbQuarterly",
    ]),
    source: "Finnhub fundamentals",
  };
}

/**
 * 查詢美股最新價格與基本資料
 * @param {string} symbol - 股票代碼
 * @returns {Promise<object>} 包含報價與基本資料的物件
 */
export async function fetchUSStockLatest(symbol) {
  const code = normalizeUsSymbol(symbol);

  try {
    // profile / metric 失敗不應影響主要報價；quote 才是判斷是否找到股票的關鍵。
    const [quote, profile, fundamentals] = await Promise.all([
      fetchFinnhubQuote(code),
      fetchFinnhubProfile(code).catch((err) => {
        console.warn("[fetchUSStockLatest] profile failed:", code, err);
        return {};
      }),
      fetchFinnhubMetric(code).then(normalizeFinnhubFundamentals).catch((err) => {
        console.warn("[fetchUSStockLatest] metric failed:", code, err);
        return null;
      }),
    ]);

    if (!quote || quote.c == null || quote.c === 0) {
      return {
        symbol: code,
        found: false,
        source: "FINNHUB",
        message: "查無資料或股票代碼無效",
        market: "US",
      };
    }

    const timestamp = quote.t ? new Date(quote.t * 1000) : new Date();
    const dateStr = timestamp.toISOString().split("T")[0];

    return {
      symbol: code,
      name: profile.name || code,

      date: dateStr,
      timestamp: quote.t || null,

      close: quote.c,
      change: quote.d,
      changePercent: quote.dp,

      open: quote.o,
      high: quote.h,
      low: quote.l,
      previousClose: quote.pc,

      volume: null,
      fundamentals,

      source: "FINNHUB",
      priceType: "realtime_quote",
      found: true,
      market: "US",
    };
  } catch (err) {
    console.error("[fetchUSStockLatest] Finnhub fetch failed:", code, err);

    return {
      symbol: code,
      found: false,
      source: "FINNHUB",
      market: "US",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
