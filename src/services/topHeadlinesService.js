// 台灣綜合頭條新聞：聚合多家主流媒體的「即時新聞」RSS（皆為直連原始網址、免 API 金鑰），
// 合併、去重、依發布時間排序後回傳。提供「不需關鍵字」的當下頭條抓取。
// 不使用 Google News RSS，因其文章連結是不可逆的轉址 token，無法還原成原始媒體網址。
const SOURCES = [
  { name: "自由時報", url: "https://news.ltn.com.tw/rss/all.xml" },
  { name: "ETtoday", url: "https://feeds.feedburner.com/ettoday/realtime" },
];
const TOP_HEADLINES_CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
const RSS_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
  Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
};
const topHeadlinesCache = new Map();

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
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
  return decodeHtmlEntities(stripCdata(match[1].trim()).trim());
}

function toIso(pubDate) {
  // RFC822 字串可能有不規則空白（如 ETtoday），先壓平再交給 Date 解析。
  const normalized = String(pubDate || "").replace(/\s+/g, " ").trim();
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeItem(itemXml, sourceName) {
  const title = extractTagContent(itemXml, "title");
  const url = extractTagContent(itemXml, "link");
  if (!title || !url) return null;

  return {
    title,
    url,
    publishedAt: toIso(extractTagContent(itemXml, "pubDate")),
    description: "",
    source: sourceName,
    provider: `${sourceName} RSS`,
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(url, { signal: controller.signal, headers: RSS_HEADERS });
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

async function fetchSource({ name, url }) {
  const xml = await fetchText(url);
  const itemMatches = String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return itemMatches
    .map((itemXml) => normalizeItem(itemXml, name))
    .filter(Boolean);
}

function recencyDesc(a, b) {
  const ta = a.publishedAt ? Date.parse(a.publishedAt) : -Infinity;
  const tb = b.publishedAt ? Date.parse(b.publishedAt) : -Infinity;
  return tb - ta;
}

function mergeHeadlines(items, max) {
  const seen = new Set();

  // 先依來源分組，各組內部新到舊排序。
  const groups = new Map();
  for (const item of items) {
    const urlKey = item.url.trim().replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
    const key = urlKey || item.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (!groups.has(item.source)) groups.set(item.source, []);
    groups.get(item.source).push(item);
  }

  const lists = [...groups.values()];
  for (const list of lists) list.sort(recencyDesc);

  // 各來源輪流取（round-robin），確保綜合呈現多家媒體，而非被單一來源洗版。
  const result = [];
  for (let i = 0; result.length < max && lists.some((l) => i < l.length); i += 1) {
    for (const list of lists) {
      if (i < list.length) {
        result.push(list[i]);
        if (result.length >= max) break;
      }
    }
  }

  return result;
}

function getCache(max) {
  const item = topHeadlinesCache.get(String(max));
  if (!item) return null;
  if (Date.now() - item.createdAt > TOP_HEADLINES_CACHE_TTL_MS) {
    topHeadlinesCache.delete(String(max));
    return null;
  }
  return item.value;
}

function setCache(max, value) {
  topHeadlinesCache.set(String(max), { createdAt: Date.now(), value });
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

/**
 * 抓取台灣綜合頭條新聞（即時，不需關鍵字，連結為原始媒體網址）。
 * @param {{max?: number}} options
 * @returns {Promise<Array<{title: string, url: string, publishedAt: string, source: string}>>}
 */
export async function fetchTopHeadlines({ max = 5 } = {}) {
  const normalizedMax = Math.min(Math.max(Number(max) || 5, 1), 10);
  const cached = getCache(normalizedMax);
  if (cached) return cached;

  const settled = await Promise.allSettled(SOURCES.map(fetchSource));
  const articles = [];
  const errors = [];

  for (const [index, result] of settled.entries()) {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
    } else {
      errors.push(`${SOURCES[index].name}：${result.reason?.message || result.reason}`);
    }
  }

  const headlines = mergeHeadlines(articles, normalizedMax);

  if (!headlines.length) {
    throw new Error(`頭條新聞抓取失敗：${errors.join("；") || "暫時查無資料"}`);
  }

  setCache(normalizedMax, headlines);
  return headlines;
}

export function buildTopHeadlinesMessage(headlines, { max = 5 } = {}) {
  const items = Array.isArray(headlines)
    ? headlines.slice(0, Math.max(Number(max) || 5, 1))
    : [];
  if (!items.length) {
    return "目前查不到頭條新聞。";
  }

  const lines = ["📰 今日頭條新聞", ""];

  for (const [index, item] of items.entries()) {
    lines.push(`${index + 1}. ${item.title}`);
    const meta = [item.source, item.publishedAt ? formatPublishedAt(item.publishedAt) : ""]
      .filter(Boolean)
      .join("｜");
    if (meta) {
      lines.push(`   ${meta}`);
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
