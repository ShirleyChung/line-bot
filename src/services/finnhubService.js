// services/finnhubService.js
import { env } from "../config/env.js";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

const finnhubCache = new Map();
const FINNHUB_CACHE_TTL_MS = 60 * 1000;

function getFinnhubApiKey() {
  const apiKey = env.FINNHUB_API_KEY;

  if (!apiKey) {
    throw new Error("缺少 FINNHUB_API_KEY 環境變數");
  }

  return apiKey;
}

function normalizeUsSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

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

export async function fetchFinnhubQuote(symbol) {
  const code = normalizeUsSymbol(symbol);

  return fetchFinnhubCached(`quote:${code}`, () =>
    fetchFinnhubJson("/quote", {
      symbol: code,
    })
  );
}

export async function fetchFinnhubProfile(symbol) {
  const code = normalizeUsSymbol(symbol);

  return fetchFinnhubCached(`profile:${code}`, () =>
    fetchFinnhubJson("/stock/profile2", {
      symbol: code,
    })
  );
}

export async function fetchFinnhubMetric(symbol) {
  const code = normalizeUsSymbol(symbol);

  return fetchFinnhubCached(`metric:${code}`, () =>
    fetchFinnhubJson("/stock/metric", {
      symbol: code,
      metric: "all",
    })
  );
}

function pickFiniteNumber(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

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

export async function fetchUSStockLatest(symbol) {
  const code = normalizeUsSymbol(symbol);

  try {
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
