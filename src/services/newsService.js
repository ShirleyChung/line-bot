const NEWS_CACHE_TTL_MS = 10 * 60 * 1000;
const newsCache = new Map();

function cacheKey({ query, lang, country, max }) {
  return [query.trim().toLowerCase(), lang, country, max].join("|");
}

function getCached(key) {
  const item = newsCache.get(key);
  if (!item || Date.now() - item.createdAt > NEWS_CACHE_TTL_MS) {
    newsCache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value) {
  newsCache.set(key, {
    createdAt: Date.now(),
    value,
  });
}

function normalizeLang(lang) {
  const value = String(lang || "zh").toLowerCase();
  if (value === "zh-tw" || value === "zh-hant") return "zh";
  return value.slice(0, 2);
}

const BRAVE_SEARCH_LANGS = new Set([
  "ar", "eu", "bn", "bg", "ca", "zh-hans", "zh-hant", "hr", "cs", "da", "nl", "en", "en-gb", "et",
  "fi", "fr", "gl", "de", "el", "gu", "he", "hi", "hu", "is", "it", "jp", "kn", "ko", "lv", "lt",
  "ms", "ml", "mr", "nb", "pl", "pt-br", "pt-pt", "pa", "ro", "ru", "sr", "sk", "sl", "es", "sv",
  "ta", "te", "th", "tr", "uk", "ur", "vi",
]);

function normalizeBraveLang(lang) {
  const value = String(lang || "zh-hant").toLowerCase().trim();

  if (value === "zh" || value === "zh-tw" || value === "zh-hant") return "zh-hant";
  if (value === "zh-cn" || value === "zh-hans") return "zh-hans";
  if (BRAVE_SEARCH_LANGS.has(value)) return value;

  const short = value.slice(0, 2);
  if (BRAVE_SEARCH_LANGS.has(short)) return short;

  return "zh-hant";
}

function normalizeCountry(country) {
  return String(country || "tw").toLowerCase().slice(0, 2);
}

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${text}`);
  }

  return resp.json();
}

function compactText(value, maxLength = 220) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function dedupeArticles(articles, max) {
  const seen = new Set();
  const result = [];

  for (const article of articles) {
    const titleKey = article.title.trim().toLowerCase();
    const urlKey = article.url.trim().replace(/^https?:\/\/(www\.)?/i, "");
    const key = urlKey || titleKey;

    if (!article.title || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(article);

    if (result.length >= max) {
      break;
    }
  }

  return result;
}

async function fetchFreeNews({ query, lang, country, max }) {
  const apiKey = process.env.FREENEWS_API_KEY;
  if (!apiKey) return [];

  const normalizedLang = normalizeLang(lang);
  const normalizedCountry = normalizeCountry(country);
  const url = new URL("https://api.freenewsapi.io/v1/news");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("language", normalizedLang);
  url.searchParams.set("country", normalizedCountry);
  url.searchParams.set("page_size", String(Math.min(Math.max(max, 1), 10)));
  url.searchParams.set("order_by", "archive");

  const data = await fetchJson(url, {
    headers: {
      "x-api-key": apiKey,
      accept: "application/json",
    },
  });

  const articles = Array.isArray(data.data) ? data.data : [];

  return articles.map((a) => ({
    title: compactText(a.title, 180),
    description: compactText(a.description || a.subtitle || a.summary || a.body),
    url: a.url || a.original_url || a.link || "",
    source: a.publisher || a.source?.name || a.source || "",
    publishedAt: a.published_at || a.publishedAt || a.date || "",
    provider: "FreeNews",
  }));
}

async function fetchGNews({ query, lang, max }) {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return [];

  const url = new URL("https://gnews.io/api/v4/search");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("lang", normalizeLang(lang));
  url.searchParams.set("max", String(Math.min(Math.max(max, 1), 10)));
  url.searchParams.set("sortby", "publishedAt");
  url.searchParams.set("apikey", apiKey);

  const data = await fetchJson(url);
  const articles = Array.isArray(data.articles) ? data.articles : [];

  return articles.map((a) => ({
    title: compactText(a.title, 180),
    description: compactText(a.description),
    url: a.url || "",
    source: a.source?.name || "",
    publishedAt: a.publishedAt || "",
    provider: "GNews",
  }));
}

async function fetchBraveNews({ query, lang, country, max }) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];

  const url = new URL("https://api.search.brave.com/res/v1/news/search");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("count", String(Math.min(Math.max(max, 1), 20)));
  url.searchParams.set("country", normalizeCountry(country));
  url.searchParams.set("search_lang", normalizeBraveLang(lang));
  url.searchParams.set("freshness", "pm");

  const data = await fetchJson(url, {
    headers: {
      accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  const articles = Array.isArray(data.results) ? data.results : [];

  return articles.map((a) => ({
    title: compactText(a.title, 180),
    description: compactText(a.description || a.extra_snippets?.[0]),
    url: a.url || "",
    source: a.profile?.name || a.meta_url?.hostname || "",
    publishedAt: a.page_age || a.age || "",
    provider: "Brave",
  }));
}

async function collectNews({ query, lang, country, max }) {
  const providers = [fetchFreeNews, fetchGNews, fetchBraveNews];
  const articles = [];
  const errors = [];

  for (const provider of providers) {
    try {
      const items = await provider({ query, lang, country, max });
      articles.push(...items);

      if (dedupeArticles(articles, max).length >= max) {
        break;
      }
    } catch (err) {
      errors.push(`${provider.name}: ${err.message}`);
    }
  }

  const deduped = dedupeArticles(articles, max);

  if (deduped.length === 0 && errors.length > 0) {
    throw new Error(`News providers failed: ${errors.join("; ")}`);
  }

  return deduped;
}

/**
 * 搜尋近期新聞。
 * 會依序嘗試 FreeNews、GNews、Brave Search，回傳 bot 內部使用的精簡欄位。
 */
export async function fetchNews({
  query,
  lang = "zh",
  country = "tw",
  max = 5,
} = {}) {
  if (!query || !query.trim()) {
    throw new Error("fetchNews: query is required");
  }

  const normalizedMax = Math.min(Math.max(Number(max) || 5, 1), 10);
  const key = cacheKey({
    query,
    lang: normalizeLang(lang),
    country: normalizeCountry(country),
    max: normalizedMax,
  });
  const cached = getCached(key);

  if (cached) {
    return cached;
  }

  if (!process.env.FREENEWS_API_KEY && !process.env.GNEWS_API_KEY && !process.env.BRAVE_SEARCH_API_KEY) {
    throw new Error("No news API key configured. Set FREENEWS_API_KEY, GNEWS_API_KEY, or BRAVE_SEARCH_API_KEY.");
  }

  const articles = await collectNews({
    query,
    lang,
    country,
    max: normalizedMax,
  });

  setCached(key, articles);
  return articles;
}
