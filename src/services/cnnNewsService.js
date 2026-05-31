const CNN_TOP_STORIES_RSS_URL = "https://rss.cnn.com/rss/cnn_topstories.rss";
const CNN_NEWS_CACHE_TTL_MS = 10 * 60 * 1000;
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

  let resp;
  try {
    resp = await fetch(CNN_TOP_STORIES_RSS_URL, {
      headers: {
        "User-Agent": "line-bot/1.0 (+https://github.com/ShirleyChung/line-bot)",
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
    });
  } catch (error) {
    throw new Error(`CNN 頭條抓取失敗：${error?.message || String(error)}`);
  }

  if (!resp.ok) {
    throw new Error(`CNN 頭條抓取失敗：HTTP ${resp.status}`);
  }

  const xml = await resp.text();
  const headlines = parseCnnRssItems(xml, normalizedMax);

  if (!headlines.length) {
    throw new Error("CNN 頭條暫時查無資料。");
  }

  setCache(normalizedMax, headlines);
  return headlines;
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
