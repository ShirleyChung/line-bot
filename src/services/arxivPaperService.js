import OpenAI from "openai";
import { env } from "../config/env.js";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const NATURE_COMMUNICATIONS_RSS_URL = "https://www.nature.com/ncomms.rss";
const NATURE_COMMUNICATIONS_NAME = "Nature Communications";
const DEFAULT_CATEGORIES = [
  "cs.PL",
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
const PRIORITY_CATEGORIES = new Set(["cs.PL"]);
const CACHE_TTL_MS = 30 * 60 * 1000;
// 完整翻譯 5～8 篇 abstract 所需的輸出量遠高於一句短摘要。
const MIN_DIGEST_OUTPUT_TOKENS = 6500;
const RETRY_DIGEST_OUTPUT_TOKENS = 8500;
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

function stripMarkup(value) {
  return decodeXml(String(value || ""))
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMetaContent(html, names) {
  const metadata = [...String(html || "").matchAll(/<meta\b[^>]*>/gi)].map((match) => {
    const tag = match[0];
    return {
      name: (tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1] || "").toLowerCase(),
      content: tag.match(/\bcontent\s*=\s*["']([\s\S]*?)["']/i)?.[1] || "",
    };
  });

  for (const name of names) {
    const content = metadata.find((item) => item.name === name)?.content;
    if (content) return stripMarkup(content);
  }
  return "";
}

export function parseNatureCommunicationsFeed(xml) {
  const firstItem = String(xml || "").match(/<item\b[^>]*>([\s\S]*?)<\/item>/i)?.[1];
  if (!firstItem) return null;

  const title = stripMarkup(firstTag(firstItem, "title"));
  const url = firstTag(firstItem, "link");
  if (!title || !url) return null;

  return {
    title,
    url,
    pdfUrl: `${url.replace(/\/$/, "")}.pdf`,
    source: NATURE_COMMUNICATIONS_NAME,
    fixedFirst: true,
  };
}

export function extractNatureCommunicationsAbstract(html) {
  return firstMetaContent(html, [
    "citation_abstract",
    "dc.description",
    "description",
  ]);
}

function parseEntryCategories(entry) {
  const terms = [];
  for (const match of entry.matchAll(/<category\b[^>]*\bterm="([^"]+)"/gi)) {
    terms.push(match[1]);
  }
  return [...new Set(terms)];
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
      pdfUrl: url.replace("/abs/", "/pdf/"),
      source: "arXiv",
      categories: parseEntryCategories(entry),
    });
  }

  return entries;
}

function isPriorityPaper(paper) {
  return (paper.categories || []).some((category) => PRIORITY_CATEGORIES.has(category));
}

function sortPapersByPriority(papers) {
  return [...papers].sort((a, b) => {
    const priorityDiff = Number(isPriorityPaper(b)) - Number(isPriorityPaper(a));
    if (priorityDiff !== 0) return priorityDiff;
    return 0;
  });
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

async function fetchNatureCommunicationsFirstPaper() {
  const rssResponse = await fetch(NATURE_COMMUNICATIONS_RSS_URL, {
    headers: { Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
  });
  if (!rssResponse.ok) {
    throw new Error(`Nature Communications RSS failed: ${rssResponse.status}`);
  }

  const paper = parseNatureCommunicationsFeed(await rssResponse.text());
  if (!paper) throw new Error("Nature Communications RSS did not contain a paper");

  const articleResponse = await fetch(paper.url, {
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (!articleResponse.ok) {
    throw new Error(`Nature Communications article failed: ${articleResponse.status}`);
  }

  return {
    ...paper,
    abstract: extractNatureCommunicationsAbstract(await articleResponse.text()),
  };
}

function buildPaperContext(papers) {
  return papers
    .map((paper, index) => {
      const categories = (paper.categories || []).join(", ");
      const priorityTag = isPriorityPaper(paper) ? " [PRIORITY: Programming Languages]" : "";
      return [
        `#${index + 1}${paper.fixedFirst ? " [MUST BE FIRST: Nature Communications]" : priorityTag}`,
        `Title: ${paper.title}`,
        `Source: ${paper.source || "arXiv"}`,
        `Categories: ${categories || "(unknown)"}`,
        `Article URL: ${paper.url}`,
        `PDF URL: ${paper.pdfUrl || "(unavailable)"}`,
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
      const translationUnavailable = "中文 abstract 翻譯暫時無法產生，請開啟原文或 PDF 閱讀。";
      return [
        `${index + 1}. ${paper.title}`,
        `中文 abstract：${translationUnavailable}`,
        `原文：${paper.url}`,
        `PDF：${paper.pdfUrl || "暫無"}`,
      ].join("\n");
    })
    .concat("資料來源：第 1 篇為 Nature Communications RSS 首篇；其餘為 arXiv submittedDate 排序。")
    .join("\n");
}

async function createDigestResponse({ papers, normalizedMax, maxOutputTokens }) {
  return openai.responses.create({
    model: env.OPENAI_MODEL,
    max_output_tokens: maxOutputTokens,
    instructions: [
      "你是嚴謹的計算機科學研究助理。",
      "第 1 篇候選是 Nature Communications RSS 的首篇，必須原樣保留為輸出的第 1 篇，絕不可替換、略過或改變順序。",
      "其餘候選為 arXiv 論文；請依既有偏好挑出足量論文，讓總數為指定篇數。",
      "最優先：程式語言（cs.PL）相關論文，例如型別系統、編譯器、程式分析、形式語義、程式驗證、合成、DSL。標記 [PRIORITY: Programming Languages] 的論文只要品質達標就應入選，至少保留 1～2 篇。",
      "次要偏好：新穎方法、強實驗、實用系統、重要基準、工程落地價值、AI/ML/系統/軟體工程/安全/人機互動相關性。",
      "每篇只翻譯提供的 abstract 為繁體中文，不要自行摘要、評論、延伸或加入重點。",
      "若某篇沒有 Abstract，改為翻譯其 Title 為繁體中文；不得以導語或猜測補寫 abstract。",
      "每篇格式固定為：有 Abstract 時為「序號. 原標題\n中文 abstract：{繁體中文完整翻譯}\n原文：{Article URL}\nPDF：{PDF URL}」；沒有 Abstract 時為「序號. 原標題\n中文標題：{繁體中文標題翻譯}\n原文：{Article URL}\nPDF：{PDF URL}」。",
      "最後加一行：資料來源：第 1 篇為 Nature Communications RSS 首篇；其餘為 arXiv submittedDate 排序。",
    ].join("\n"),
    input: [
      `請輸出共 ${normalizedMax} 篇。第 1 篇固定為 Nature Communications；其餘為最新計算機科學與工程相關 arXiv 論文。`,
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

  const [natureResult, arxivResult] = await Promise.allSettled([
    fetchNatureCommunicationsFirstPaper(),
    fetchArxivEntries({ categories: normalizedCategories, fetchCount: normalizedFetchCount }),
  ]);
  const naturePaper = natureResult.status === "fulfilled" ? natureResult.value : null;
  if (natureResult.status === "rejected") {
    console.warn("[arxivPaperService] Nature Communications fetch failed", natureResult.reason);
  }
  if (!naturePaper) {
    return "Nature Communications 目前無法取得 RSS 首篇論文，因此本次不提供論文摘要，以避免第 1 篇來源不符合設定。";
  }
  if (arxivResult.status === "rejected") throw arxivResult.reason;
  const rawPapers = arxivResult.value;

  if (!rawPapers.length) {
    return buildFallbackDigest([naturePaper], 1);
  }

  const papers = [
    ...(naturePaper ? [naturePaper] : []),
    ...sortPapersByPriority(rawPapers),
  ];

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
