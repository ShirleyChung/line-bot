/**
 * 使用 Brave Search Web API 做一般網頁搜尋。
 *
 * 與 newsService 不同的是：
 * - newsService 抓即時新聞
 * - 這裡抓一般網頁，適合查公開資訊、定義、教學、官方資料等
 *
 * 需要的環境變數：BRAVE_SEARCH_API_KEY
 */

const WEB_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const webSearchCache = new Map();

const FRESHNESS_VALUES = new Set(["pd", "pw", "pm", "py"]);

function cacheKey({ query, count, country, lang, freshness }) {
  return [
    query.trim().toLowerCase(),
    count,
    country,
    lang,
    freshness || "",
  ].join("|");
}

function getCached(key) {
  const item = webSearchCache.get(key);
  if (!item || Date.now() - item.createdAt > WEB_SEARCH_CACHE_TTL_MS) {
    webSearchCache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value) {
  webSearchCache.set(key, {
    createdAt: Date.now(),
    value,
  });
}

function normalizeLang(lang) {
  const value = String(lang || "zh").toLowerCase();
  if (value === "zh-tw" || value === "zh-hant") return "zh-hant";
  return value.slice(0, 7);
}

function normalizeCountry(country) {
  return String(country || "tw").toLowerCase().slice(0, 2);
}

function compactText(value, maxLength = 280) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function dedupeResults(results, max) {
  const seen = new Set();
  const out = [];

  for (const r of results) {
    const urlKey = String(r.url || "").trim().replace(/^https?:\/\/(www\.)?/i, "");
    if (!urlKey || seen.has(urlKey)) continue;
    seen.add(urlKey);
    out.push(r);
    if (out.length >= max) break;
  }

  return out;
}

/**
 * 直接呼叫 Brave Search Web API。
 *
 * @param {object} params
 * @param {string} params.query - 搜尋字串
 * @param {number} [params.count=5] - 想取得的結果數量，1-10
 * @param {string} [params.country="tw"]
 * @param {string} [params.lang="zh-hant"]
 * @param {string} [params.freshness] - "pd"(過去一天)/"pw"(週)/"pm"(月)/"py"(年)
 * @returns {Promise<{query:string, results:Array}>}
 */
export async function searchWeb({
  query,
  count = 5,
  country = "tw",
  lang = "zh-hant",
  freshness = "",
} = {}) {
  if (!query || !String(query).trim()) {
    throw new Error("searchWeb: query 不可為空");
  }

  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error("尚未設定 BRAVE_SEARCH_API_KEY，無法進行網路搜尋");
  }

  const normalizedCount = Math.min(Math.max(Number(count) || 5, 1), 10);
  const normalizedCountry = normalizeCountry(country);
  const normalizedLang = normalizeLang(lang);
  const normalizedFreshness = FRESHNESS_VALUES.has(String(freshness).toLowerCase())
    ? String(freshness).toLowerCase()
    : "";

  const key = cacheKey({
    query,
    count: normalizedCount,
    country: normalizedCountry,
    lang: normalizedLang,
    freshness: normalizedFreshness,
  });
  const cached = getCached(key);
  if (cached) return cached;

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("count", String(normalizedCount));
  url.searchParams.set("country", normalizedCountry);
  url.searchParams.set("search_lang", normalizedLang);
  url.searchParams.set("safesearch", "moderate");
  if (normalizedFreshness) {
    url.searchParams.set("freshness", normalizedFreshness);
  }

  const resp = await fetch(url, {
    headers: {
      accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Brave Search 回應 ${resp.status}：${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  const items = Array.isArray(data?.web?.results) ? data.web.results : [];

  const mapped = items.map((a) => ({
    title: compactText(a.title, 180),
    description: compactText(a.description || a.extra_snippets?.[0]),
    url: a.url || "",
    source: a.profile?.name || a.meta_url?.hostname || "",
    age: a.age || a.page_age || "",
  }));

  const deduped = dedupeResults(mapped, normalizedCount);

  const result = {
    query: query.trim(),
    count: deduped.length,
    results: deduped,
  };

  setCached(key, result);
  return result;
}
