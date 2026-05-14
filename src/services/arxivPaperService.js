import OpenAI from "openai";
import { env } from "../config/env.js";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const DEFAULT_CATEGORIES = [
  "cs.AI",
  "cs.LG",
  "cs.CL",
  "cs.CV",
  "cs.RO",
  "cs.SE",
  "cs.CR",
  "cs.DB",
  "cs.DC",
  "cs.HC",
  "cs.IR",
  "cs.NE",
  "eess.SY",
];
const CACHE_TTL_MS = 30 * 60 * 1000;
const MIN_DIGEST_OUTPUT_TOKENS = 3000;
const RETRY_DIGEST_OUTPUT_TOKENS = 4500;
const arxivCache = new Map();

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

function cacheKey(options) {
  return JSON.stringify({
    max: options.max,
    fetchCount: options.fetchCount,
    categories: options.categories,
  });
}

function getCached(key) {
  const item = arxivCache.get(key);
  if (!item || Date.now() - item.createdAt > CACHE_TTL_MS) {
    arxivCache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value) {
  arxivCache.set(key, {
    createdAt: Date.now(),
    value,
  });
}

function compactText(value, maxLength = 1200) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function firstTag(entry, tagName) {
  const match = entry.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return decodeXml(compactText(match?.[1] || "", 3000));
}

function parseArxivFeed(xml) {
  const entries = [];
  const matches = xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi);

  for (const match of matches) {
    const entry = match[1];
    const url = firstTag(entry, "id");
    const title = firstTag(entry, "title");
    const summary = firstTag(entry, "summary");

    if (!url || !title || !summary) continue;

    entries.push({
      title,
      abstract: summary,
      url,
    });
  }

  return entries;
}

function buildSearchQuery(categories) {
  return categories.map((category) => `cat:${category}`).join(" OR ");
}

function normalizeCategories(categories) {
  const values = Array.isArray(categories) && categories.length ? categories : DEFAULT_CATEGORIES;
  return [...new Set(values.map((category) => String(category).trim()).filter(Boolean))];
}

function normalizeMax(max) {
  return Math.min(Math.max(Number(max) || 6, 5), 8);
}

async function fetchArxivEntries({ categories, fetchCount }) {
  const url = new URL(ARXIV_API_URL);
  url.searchParams.set("search_query", buildSearchQuery(categories));
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(fetchCount));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");

  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`arXiv API failed: ${resp.status} ${text}`);
  }

  return parseArxivFeed(await resp.text());
}

function buildPaperContext(papers) {
  return papers
    .map((paper, index) => {
      return [
        `#${index + 1}`,
        `Title: ${paper.title}`,
        `URL: ${paper.url}`,
        `Abstract: ${compactText(paper.abstract, 650)}`,
      ].join("\n");
    })
    .join("\n\n");
}

function digestTokenBudget(minimum = MIN_DIGEST_OUTPUT_TOKENS) {
  return Math.max(Number(env.OPENAI_MAX_OUTPUT_TOKENS) || 0, minimum);
}

function extractResponseText(response) {
  const outputText = response?.output_text?.trim();
  if (outputText) return outputText;

  const textParts = (response?.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .filter(Boolean);

  return textParts.join("\n").trim();
}

function buildFallbackDigest(papers, max) {
  return papers
    .slice(0, max)
    .map((paper, index) => {
      const summary = compactText(paper.abstract, 130);
      return `${index + 1}. ${paper.title}；${summary}；${paper.url}`;
    })
    .concat("資料來源：arXiv，依 submittedDate 排序。")
    .join("\n");
}

async function createDigestResponse({ papers, normalizedMax, maxOutputTokens }) {
  return openai.responses.create({
    model: env.OPENAI_MODEL,
    max_output_tokens: maxOutputTokens,
    instructions: [
      "你是嚴謹的計算機科學研究助理。",
      "請從候選 arXiv 論文中挑出最值得看的 5 到 8 篇。",
      "偏好：新穎方法、強實驗、實用系統、重要基準、工程落地價值、AI/ML/系統/軟體工程/安全/人機互動相關性。",
      "只能根據標題與 abstract 判斷，不要編造 abstract 沒有提到的貢獻。",
      "請用繁體中文輸出，極簡短。",
      "每篇格式：序號. 原標題；一句中文重點摘要；arXiv 連結。",
      "最後加一行：資料來源：arXiv，依 submittedDate 排序。",
    ].join("\n"),
    input: [
      `請挑選 ${normalizedMax} 篇。今天要整理的是最新計算機科學與工程相關論文。`,
      "候選論文如下：",
      buildPaperContext(papers),
    ].join("\n\n"),
  });
}

export async function buildLatestArxivPaperDigest({
  max = 6,
  categories,
  fetchCount = 20,
} = {}) {
  const normalizedMax = normalizeMax(max);
  const normalizedCategories = normalizeCategories(categories);
  const normalizedFetchCount = Math.min(Math.max(Number(fetchCount) || 20, normalizedMax), 25);
  const key = cacheKey({
    max: normalizedMax,
    fetchCount: normalizedFetchCount,
    categories: normalizedCategories,
  });
  const cached = getCached(key);

  if (cached) return cached;

  const papers = await fetchArxivEntries({
    categories: normalizedCategories,
    fetchCount: normalizedFetchCount,
  });

  if (!papers.length) {
    return "arXiv 目前沒有抓到新的計算機科學與工程相關論文。";
  }

  let response = await createDigestResponse({
    papers,
    normalizedMax,
    maxOutputTokens: digestTokenBudget(),
  });
  let text = extractResponseText(response);

  if (!text && response?.status === "incomplete") {
    console.warn("[arxivPaperService] OpenAI response incomplete, retrying", {
      status: response.status,
      incompleteDetails: response.incomplete_details,
      maxOutputTokens: digestTokenBudget(RETRY_DIGEST_OUTPUT_TOKENS),
    });
    response = await createDigestResponse({
      papers,
      normalizedMax,
      maxOutputTokens: digestTokenBudget(RETRY_DIGEST_OUTPUT_TOKENS),
    });
    text = extractResponseText(response);
  }

  if (!text) {
    console.warn("[arxivPaperService] OpenAI returned empty digest, using fallback", {
      status: response?.status,
      incompleteDetails: response?.incomplete_details,
    });
  }

  const result = text || buildFallbackDigest(papers, normalizedMax);
  setCached(key, result);

  return result;
}
