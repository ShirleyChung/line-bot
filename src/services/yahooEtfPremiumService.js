import { fetchUpamcEtfPremium, isUpamcEtf } from "./upamcEtfService.js";

const YAHOO_ETF_COMPARE_URL =
  "https://tw.stock.yahoo.com/_td-stock/api/resource/StockServices.etfCompare;symbol=";

const ETF_PREMIUM_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

const ETF_PREMIUM_CACHE_TTL_MS = 60 * 1000;
const etfPremiumCache = new Map();

function parsePremiumPercent(value) {
  if (value == null) return null;

  const s = String(value)
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim();

  if (s === "" || s === "-" || s === "--") return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function fetchTaiwanEtfPremium(symbol) {
  const code = String(symbol || "").trim().toUpperCase();

  if (!code) {
    throw new Error("缺少 ETF 代碼");
  }

  if (isUpamcEtf(code)) {
    return fetchUpamcEtfPremium(code);
  }

  const now = Date.now();
  const cached = etfPremiumCache.get(code);
  if (cached && now - cached.cachedAt < ETF_PREMIUM_CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${YAHOO_ETF_COMPARE_URL}${encodeURIComponent(code)}.TW`;
  console.log("[fetchTaiwanEtfPremium] url =", url);

  const res = await fetch(url, {
    headers: ETF_PREMIUM_HEADERS,
    redirect: "follow",
  });

  const text = await res.text();
  console.log("[fetchTaiwanEtfPremium] status =", res.status);

  if (!res.ok) {
    if (res.status === 404 || res.status === 500) {
      const notFound = {
        symbol: code,
        found: false,
        source: "YAHOO_ETF_COMPARE",
        message: "查無 ETF 折溢價資料。",
      };
      etfPremiumCache.set(code, {
        cachedAt: now,
        data: notFound,
      });
      return notFound;
    }

    throw new Error(`Yahoo ETF 折溢價查詢失敗 HTTP ${res.status}：${text.slice(0, 200)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Yahoo ETF 折溢價回傳格式錯誤：${text.slice(0, 200)}`);
  }

  const premiumPercent = parsePremiumPercent(json?.performance?.premiumDiscount?.daily);

  if (premiumPercent == null) {
    const missing = {
      symbol: code,
      found: false,
      source: "YAHOO_ETF_COMPARE",
      message: "查無 ETF 折溢價資料。",
    };
    etfPremiumCache.set(code, {
      cachedAt: now,
      data: missing,
    });
    return missing;
  }

  const result = {
    symbol: code,
    found: true,
    source: "YAHOO_ETF_COMPARE",
    premiumPercent,
  };

  etfPremiumCache.set(code, {
    cachedAt: now,
    data: result,
  });

  return result;
}
