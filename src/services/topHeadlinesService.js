// 綜合頭條新聞：聚合多家國際主流媒體的即時 RSS（皆為直連原始網址、免 API 金鑰），
// 每家最多取兩則，並產生短篇繁中摘要。
// 不使用 Google News RSS，因其文章連結是不可逆的轉址 token，無法還原成原始媒體網址。
import OpenAI from "openai";
import { env } from "../config/env.js";

const SOURCES = [
  { name: "CNN", url: "https://rss.cnn.com/rss/cnn_topstories.rss" },
  { name: "Reuters", url: "https://feeds.feedburner.com/Reuters/topNews" },
  { name: "Bloomberg", url: "https://feeds.bloomberg.com/markets/news.rss" },
  { name: "新華社", url: "http://www.xinhuanet.com/english/rss/worldrss.xml" },
  { name: "BBC", url: "https://feeds.bbci.co.uk/news/rss.xml" },
];
const TOP_HEADLINES_CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_PER_SOURCE = 2;
const MAX_HEADLINES = 10;
const RSS_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
  Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
};
const topHeadlinesCache = new Map();
const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const CHINESE_SUMMARY_UNAVAILABLE = "中文摘要暫時無法產生，請開啟原文連結閱覽";

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
    description: extractTagContent(itemXml, "description")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500),
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

function parseSummaryResponse(value) {
  const text = String(value || "").trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    return Array.isArray(parsed?.summaries) ? parsed.summaries : [];
  } catch {
    // 保留對舊模型可能附上 Markdown code fence 的相容性。
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const entries = JSON.parse(match[0]);
      return Array.isArray(entries) ? entries : [];
    } catch {
      return [];
    }
  }
}

function normalizeChineseSummary(value) {
  const summary = String(value || "").replace(/\s+/g, " ").trim().slice(0, 48);
  // 避免模型未遵守指示而將英文原文直接送給使用者。
  return /[\u3400-\u9fff]/.test(summary) ? summary : "";
}

async function addChineseSummaries(headlines) {
  if (!headlines.length || !env.OPENAI_API_KEY) return headlines;

  const input = headlines.map((item, index) => ({
    id: index,
    source: item.source,
    title: item.title,
    description: item.description,
  }));

  try {
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      max_output_tokens: 600,
      instructions: [
        "你是新聞編輯。根據每則提供的標題與導語，寫繁體中文的客觀摘要。",
        "每則摘要限 16 到 24 個中文字左右，不要加標點以外的前綴、不要臆測。",
        "不得輸出英文原文或英文摘要；專有名詞必要時可保留英文。",
      ].join("\n"),
      input: JSON.stringify(input),
      text: {
        format: {
          type: "json_schema",
          name: "headline_summaries",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summaries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    summary: { type: "string" },
                  },
                  required: ["id", "summary"],
                  additionalProperties: false,
                },
              },
            },
            required: ["summaries"],
            additionalProperties: false,
          },
        },
      },
    });
    const summaries = new Map(
      parseSummaryResponse(response.output_text)
        .filter((item) => Number.isInteger(item?.id) && typeof item?.summary === "string")
        .map((item) => [item.id, normalizeChineseSummary(item.summary)])
        .filter(([, summary]) => summary),
    );

    return headlines.map((item, index) => ({
      ...item,
      summary: summaries.get(index) || CHINESE_SUMMARY_UNAVAILABLE,
    }));
  } catch (error) {
    console.warn("[topHeadlines] Chinese summarization failed:", error?.message || error);
    // 不以英文標題冒充摘要；仍提供原始連結，讓使用者可繼續閱讀。
    return headlines.map((item) => ({ ...item, summary: CHINESE_SUMMARY_UNAVAILABLE }));
  }
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
  for (const list of lists) {
    list.sort(recencyDesc);
    list.splice(MAX_PER_SOURCE);
  }

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
 * 抓取綜合頭條新聞（即時，不需關鍵字，連結為原始媒體網址）。
 * @param {{max?: number}} options
 * @returns {Promise<Array<{title: string, summary: string, url: string, publishedAt: string, source: string}>>}
 */
export async function fetchTopHeadlines({ max = 10 } = {}) {
  const normalizedMax = Math.min(Math.max(Number(max) || 10, 1), MAX_HEADLINES);
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

  const headlines = await addChineseSummaries(mergeHeadlines(articles, normalizedMax));

  if (!headlines.length) {
    throw new Error(`頭條新聞抓取失敗：${errors.join("；") || "暫時查無資料"}`);
  }

  setCache(normalizedMax, headlines);
  return headlines;
}

export function buildTopHeadlinesMessage(headlines, { max = 10 } = {}) {
  const items = Array.isArray(headlines)
    ? headlines.slice(0, Math.min(Math.max(Number(max) || 10, 1), MAX_HEADLINES))
    : [];
  if (!items.length) {
    return "目前查不到頭條新聞。";
  }

  const lines = ["📰 今日頭條新聞", ""];

  for (const [index, item] of items.entries()) {
    // 最後一道輸出防線：即使有舊快取或上游資料漏掉 summary，也不能把英文原文當中文摘要送出。
    const displayText =
      normalizeChineseSummary(item.summary) ||
      normalizeChineseSummary(item.title) ||
      CHINESE_SUMMARY_UNAVAILABLE;
    lines.push(`${index + 1}. 【${item.source}】${displayText}`);
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
