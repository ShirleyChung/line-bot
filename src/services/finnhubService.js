import Finnhub from 'finnhub';

const api_key = Finnhub.ApiClient.instance.authentications['api_key'];
api_key.apiKey = process.env.FINNHUB_API_KEY;
const finnhubClient = new Finnhub.DefaultApi();

const finnhubCache = new Map();
const FINNHUB_CACHE_TTL_MS = 60 * 1000;

export async function fetchFinnhubQuote(symbol) {
  const code = String(symbol).trim().toUpperCase();

  const cacheKey = `quote:${code}`;
  const now = Date.now();

  const cached = finnhubCache.get(cacheKey);
  if (cached && now - cached.cachedAt < FINNHUB_CACHE_TTL_MS) {
    return cached.data;
  }

  return new Promise((resolve, reject) => {
    finnhubClient.quote(code, (error, data, response) => {
      if (error) {
        reject(error);
        return;
      }

      finnhubCache.set(cacheKey, {
        cachedAt: now,
        data: data,
      });

      resolve(data);
    });
  });
}

export async function fetchFinnhubProfile(symbol) {
  const code = String(symbol).trim().toUpperCase();

  const cacheKey = `profile:${code}`;
  const now = Date.now();

  const cached = finnhubCache.get(cacheKey);
  if (cached && now - cached.cachedAt < FINNHUB_CACHE_TTL_MS) {
    return cached.data;
  }

  return new Promise((resolve, reject) => {
    finnhubClient.companyProfile2({ symbol: code }, (error, data, response) => {
      if (error) {
        reject(error);
        return;
      }

      finnhubCache.set(cacheKey, {
        cachedAt: now,
        data: data,
      });

      resolve(data);
    });
  });
}

export async function fetchUSStockLatest(symbol) {
  const code = String(symbol).trim().toUpperCase();

  try {
    const [quote, profile] = await Promise.all([
      fetchFinnhubQuote(code),
      fetchFinnhubProfile(code).catch(() => ({})),
    ]);

    if (!quote || quote.c == null || quote.c === 0) {
      return {
        symbol: code,
        found: false,
        source: "FINNHUB",
        message: "查無資料或股票代碼無效",
      };
    }

    const timestamp = quote.t ? new Date(quote.t * 1000) : new Date();
    const dateStr = timestamp.toISOString().split('T')[0];

    return {
      symbol: code,
      name: profile.name || code,
      date: dateStr,
      close: quote.c,
      change: quote.d,
      changePercent: quote.dp,
      open: quote.o,
      high: quote.h,
      low: quote.l,
      previousClose: quote.pc,
      volume: null,
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
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
