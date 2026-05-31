const CNN_TOP_STORIES_RSS_URL = "https://rss.cnn.com/rss/cnn_topstories.rss";
const CNN_TOP_STORIES_HTML_URL = "https://www.cnn.com";
const CNN_NEWS_CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7",
  Referer: "https://www.cnn.com/",
};
const BROWSER_HEADERS = {
  ...COMMON_HEADERS,
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "sec-ch-ua": "\"Chromium\";v=\"137\", \"Google Chrome\";v=\"137\", \"Not/A)Brand\";v=\"24\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"macOS\"",
};
const RSS_HEADERS = {
  ...COMMON_HEADERS,
};
const cnnNewsCache = new Map();

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripCdata(value) {
  return String(value || "")
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "");
}

function extractTagContent(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = String(xml || "").match(regex);
  if (!match) return "";
  return decodeHtmlEntities(stripCdata(match[1]).trim());
}

function normalizeHeadline(itemXml) {
  const title = extractTagContent(itemXml, "title");
  const url = extractTagContent(itemXml, "link");
  const publishedAt = extractTagContent(itemXml, "pubDate");
  const description = extractTagContent(itemXml, "description")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!title || !url) return null;

  return {
    title,
    url,
    publishedAt,
    description: description.slice(0, 160),
    source: "CNN",
    provider: "CNN RSS",
  };
}

function parseCnnRssItems(xml, max) {
  const itemMatches = String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const results = [];

  for (const itemXml of itemMatches) {
    const normalized = normalizeHeadline(itemXml);
    if (!normalized) continue;
    results.push(normalized);
    if (results.length >= max) break;
  }

  return results;
}

function normalizeCnnUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.startsWith("/")) {
    return `https://www.cnn.com${value}`;
  }

  return "";
}

function inferPublishedAtFromUrl(url) {
  const match = String(url || "").match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}T00:00:00Z`;
}

function parseCnnHomepageItems(html, max) {
  const anchorRegex = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const headlineRegex = /<span[^>]*class="[^"]*container__headline-text[^"]*"[^>]*>([\s\S]*?)<\/span>/i;
  const seen = new Set();
  const results = [];
  let match;

  while ((match = anchorRegex.exec(String(html || "")))) {
    const rawUrl = normalizeCnnUrl(match[1]);
    if (!rawUrl || seen.has(rawUrl)) continue;
    if (!rawUrl.startsWith("https://www.cnn.com/")) continue;

    const headlineMatch = match[2].match(headlineRegex);
    if (!headlineMatch) continue;

    const title = decodeHtmlEntities(
      stripCdata(headlineMatch[1])
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );

    if (!title) continue;

    seen.add(rawUrl);
    results.push({
      title,
      url: rawUrl,
      publishedAt: inferPublishedAtFromUrl(rawUrl),
      description: "",
      source: "CNN",
      provider: "CNN Homepage",
    });

    if (results.length >= max) break;
  }

  return results;
}

async function fetchText(url, { accept, browserLike = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        ...(browserLike ? BROWSER_HEADERS : RSS_HEADERS),
        ...(accept ? { Accept: accept } : {}),
      },
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    return resp.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("連線逾時");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function getCache(max) {
  const key = String(max);
  const item = cnnNewsCache.get(key);
  if (!item) return null;

  if (Date.now() - item.createdAt > CNN_NEWS_CACHE_TTL_MS) {
    cnnNewsCache.delete(key);
    return null;
  }

  return item.value;
}

function setCache(max, value) {
  cnnNewsCache.set(String(max), {
    createdAt: Date.now(),
    value,
  });
}

function formatPublishedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export async function fetchCnnTopHeadlines({ max = 3 } = {}) {
  const normalizedMax = Math.min(Math.max(Number(max) || 3, 1), 10);
  const cached = getCache(normalizedMax);
  if (cached) return cached;

  let rssError;
  try {
    const xml = await fetchText(CNN_TOP_STORIES_RSS_URL, {
      accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    });
    const headlines = parseCnnRssItems(xml, normalizedMax);

    if (headlines.length) {
      setCache(normalizedMax, headlines);
      return headlines;
    }

    rssError = new Error("CNN RSS 暫時查無資料");
  } catch (error) {
    rssError = new Error(`CNN RSS：${error?.message || String(error)}`);
  }

  try {
    const html = await fetchText(CNN_TOP_STORIES_HTML_URL, {
      accept: "text/html,application/xhtml+xml",
      browserLike: true,
    });
    const headlines = parseCnnHomepageItems(html, normalizedMax);

    if (!headlines.length) {
      throw new Error("CNN 首頁暫時查無資料");
    }

    setCache(normalizedMax, headlines);
    return headlines;
  } catch (fallbackError) {
    const message = [
      rssError?.message || "",
      `CNN 首頁：${fallbackError?.message || String(fallbackError)}`,
    ]
      .filter(Boolean)
      .join("；");
    throw new Error(`CNN 頭條抓取失敗：${message}`);
  }
}

export function buildCnnTopHeadlinesMessage(headlines, { max = 3 } = {}) {
  const items = Array.isArray(headlines) ? headlines.slice(0, Math.max(Number(max) || 3, 1)) : [];
  if (!items.length) {
    return "目前查不到 CNN 頭條新聞。";
  }

  const lines = ["📰 CNN 頭條新聞", ""];

  for (const [index, item] of items.entries()) {
    lines.push(`${index + 1}. ${item.title}`);
    if (item.publishedAt) {
      lines.push(`   時間：${formatPublishedAt(item.publishedAt)}`);
    }
    if (item.url) {
      lines.push(`   ${item.url}`);
    }
    if (index !== items.length - 1) {
      lines.push("");
    }
  }

  return lines.join("\n");
}
