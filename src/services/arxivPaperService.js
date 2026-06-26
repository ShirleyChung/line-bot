import OpenAI from "openai";
import { env } from "../config/env.js";
import { db } from "./firestore.js";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const NATURE_COMMUNICATIONS_RSS_URL = "https://www.nature.com/ncomms.rss";
const NATURE_COMMUNICATIONS_NAME = "Nature Communications";
const CHEMRXIV_CROSSREF_URL = "https://api.crossref.org/works";
const TAIWAN_THESES_URL = "https://ndltd.ncl.edu.tw/cgi-bin/gs32/gsweb.cgi";
const DOAJ_ARTICLES_URL = "https://doaj.org/api/search/articles/archaeology";
const ARXIV_TOPIC_QUERIES = [
  { label: "AI", categories: ["cs.AI", "cs.LG"] },
  { label: "IC-Design", query: '(cat:cs.AR OR cat:cs.ET) AND (ti:"IC design" OR abs:"IC design" OR ti:VLSI OR abs:VLSI OR ti:EDA OR abs:EDA OR ti:"integrated circuit" OR abs:"integrated circuit")' },
  { label: "FPGA", query: '(cat:cs.AR OR cat:cs.DC OR cat:eess.SY) AND (ti:FPGA OR abs:FPGA)' },
  { label: "通訊", categories: ["cs.IT", "eess.SP"] },
  { label: "控制", categories: ["eess.SY", "math.OC"] },
  { label: "Robotics", categories: ["cs.RO"] },
  { label: "Computer-Architecture", categories: ["cs.AR"] },
];
const PRIORITY_CATEGORIES = new Set(ARXIV_TOPIC_QUERIES.flatMap((topic) => topic.categories || []));
const PAPER_HISTORY_COLLECTION = "paper_source_cache";
const PAPER_HISTORY_DOC = "fixed_digest_v1";
const PAPER_HISTORY_LIMIT = 2;
// 完整翻譯固定 11 篇 abstract 所需的輸出量遠高於一句短摘要。
const MIN_DIGEST_OUTPUT_TOKENS = 12000;
const RETRY_DIGEST_OUTPUT_TOKENS = 16000;
const paperHistoryMemory = new Map();

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

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

function firstArrayValue(value) {
  return Array.isArray(value) ? value.find(Boolean) || "" : value || "";
}

function sourceKey(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  return encodeURIComponent(normalized);
}

function paperSourceKey(paper) {
  return paper.sourceKey || sourceKey(paper.source || paper.topic || paper.title);
}

function normalizePaperTitle(title) {
  return String(title || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function cloneHistory(history = paperHistoryMemory) {
  return new Map([...history.entries()].map(([key, entries]) => [key, entries.map((entry) => ({ ...entry }))]));
}

function normalizeHistoryEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      title: String(entry?.title || "").trim(),
      normalizedTitle: normalizePaperTitle(entry?.normalizedTitle || entry?.title),
      url: String(entry?.url || "").trim(),
      usedAt: String(entry?.usedAt || ""),
    }))
    .filter((entry) => entry.title && entry.normalizedTitle)
    .slice(0, PAPER_HISTORY_LIMIT);
}

async function loadPaperHistory() {
  try {
    const snapshot = await db.collection(PAPER_HISTORY_COLLECTION).doc(PAPER_HISTORY_DOC).get();
    const sources = snapshot.exists ? snapshot.data()?.sources || {} : {};
    paperHistoryMemory.clear();
    for (const [key, entries] of Object.entries(sources)) {
      paperHistoryMemory.set(key, normalizeHistoryEntries(entries));
    }
  } catch (error) {
    console.warn("[arxivPaperService] Paper history Firestore load failed, using memory cache", error);
  }

  return cloneHistory();
}

async function savePaperHistory(history) {
  paperHistoryMemory.clear();
  const sources = {};
  for (const [key, entries] of history.entries()) {
    const normalizedEntries = normalizeHistoryEntries(entries);
    paperHistoryMemory.set(key, normalizedEntries);
    sources[key] = normalizedEntries;
  }

  try {
    await db.collection(PAPER_HISTORY_COLLECTION).doc(PAPER_HISTORY_DOC).set({
      sources,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    console.warn("[arxivPaperService] Paper history Firestore save failed, kept memory cache only", error);
  }
}

function paperWasRecentlyUsed(paper, history, key = paperSourceKey(paper)) {
  const title = normalizePaperTitle(paper.title);
  const url = String(paper.url || "").trim();
  return (history.get(key) || []).some((entry) => (
    entry.normalizedTitle === title ||
    (url && entry.url === url)
  ));
}

export function selectFreshPaper(candidates, source, history = new Map(), usedUrls = new Set()) {
  const key = sourceKey(source);
  const validCandidates = (Array.isArray(candidates) ? candidates : []).filter((paper) => paper?.title && !paper.unavailable);
  return (
    validCandidates.find((paper) => !usedUrls.has(paper.url) && !paperWasRecentlyUsed(paper, history, key)) ||
    validCandidates.find((paper) => !usedUrls.has(paper.url)) ||
    validCandidates[0] ||
    null
  );
}

function rememberPaper(history, paper) {
  if (!paper?.title || paper.unavailable) return;
  const key = paperSourceKey(paper);
  const normalizedTitle = normalizePaperTitle(paper.title);
  const entry = {
    title: paper.title,
    normalizedTitle,
    url: String(paper.url || "").trim(),
    usedAt: new Date().toISOString(),
  };
  const nextEntries = [
    entry,
    ...(history.get(key) || []).filter((item) => (
      item.normalizedTitle !== normalizedTitle &&
      (!entry.url || item.url !== entry.url)
    )),
  ].slice(0, PAPER_HISTORY_LIMIT);
  history.set(key, nextEntries);
}

function rememberPapers(history, papers) {
  for (const paper of papers) {
    rememberPaper(history, paper);
  }
}

function unavailablePaper(source, message, url = "") {
  return {
    title: `${source} 目前無法取得符合條件的論文`,
    abstract: message,
    url,
    pdfUrl: "",
    source,
    unavailable: true,
  };
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
  return parseNatureCommunicationsFeedItems(xml, 1)[0] || null;
}

export function parseNatureCommunicationsFeedItems(xml, limit = 10) {
  const items = [...String(xml || "").matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .slice(0, limit)
    .map((match) => {
      const item = match[1];
      const title = stripMarkup(firstTag(item, "title"));
      const url = firstTag(item, "link");
      if (!title || !url) return null;

      return {
        title,
        url,
        pdfUrl: `${url.replace(/\/$/, "")}.pdf`,
        source: NATURE_COMMUNICATIONS_NAME,
        fixedFirst: true,
      };
    })
    .filter(Boolean);

  return items;
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

function parseCrossrefChemrxivItems(data) {
  const items = data?.message?.items || [];
  return items
    .filter((item) => item?.DOI && String(item.DOI).toLowerCase().startsWith("10.26434/"))
    .map((item) => ({
      title: stripMarkup(firstArrayValue(item.title)),
      abstract: stripMarkup(item.abstract || item.description || ""),
      url: item.resource?.primary?.URL || item.URL || `https://doi.org/${item.DOI}`,
      pdfUrl: (item.link || []).find((link) => String(link.URL || "").includes("/pdf/"))?.URL || "",
      source: "ChemRxiv",
    }))
    .filter((paper) => paper.title && paper.url);
}

function parseDoajResult(item) {
  const bibjson = item?.bibjson || {};
  const link = (bibjson.link || []).find((candidate) => candidate.type === "fulltext") || bibjson.link?.[0];
  const doi = (bibjson.identifier || []).find((identifier) => identifier.type === "doi")?.id;
  const url = link?.url || (doi ? `https://doi.org/${doi}` : "");

  if (!bibjson.title || !url) return null;

  return {
    title: stripMarkup(bibjson.title),
    abstract: stripMarkup(bibjson.abstract || ""),
    url,
    pdfUrl: link?.content_type === "pdf" ? url : "",
    source: "DOAJ archaeology",
  };
}

export function parseDoajArticle(data) {
  return parseDoajArticles(data, 1)[0] || null;
}

export function parseDoajArticles(data, limit = 10) {
  return (data?.results || [])
    .slice(0, limit)
    .map(parseDoajResult)
    .filter(Boolean);
}

function isPriorityPaper(paper) {
  return (paper.categories || []).some((category) => PRIORITY_CATEGORIES.has(category));
}

function buildSearchQuery(categories) {
  return categories.map((category) => `cat:${category}`).join(" OR ");
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

async function fetchArxivEntriesByQuery({ query, fetchCount }) {
  const url = new URL(ARXIV_API_URL);
  url.searchParams.set("search_query", query);
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

async function fetchArxivTopicPapers(history) {
  const selected = [];
  const usedUrls = new Set();

  for (const topic of ARXIV_TOPIC_QUERIES) {
    try {
      const topicSource = `arXiv ${topic.label}`;
      const papers = topic.query
        ? await fetchArxivEntriesByQuery({ query: topic.query, fetchCount: 10 })
        : await fetchArxivEntries({ categories: topic.categories, fetchCount: 10 });
      const paper = selectFreshPaper(papers, topicSource, history, usedUrls);
      if (!paper) {
        selected.push(unavailablePaper("arXiv", `arXiv ${topic.label} 目前沒有取得符合條件的最新論文。`));
        continue;
      }
      usedUrls.add(paper.url);
      selected.push({
        ...paper,
        source: topicSource,
        sourceKey: sourceKey(topicSource),
        topic: topic.label,
      });
    } catch (error) {
      console.warn(`[arxivPaperService] arXiv ${topic.label} fetch failed`, error);
      selected.push(unavailablePaper("arXiv", `arXiv ${topic.label} 抓取失敗：${error?.message || error}`));
    }
  }

  return selected;
}

async function fetchChemrxivPaper(history) {
  const url = new URL(CHEMRXIV_CROSSREF_URL);
  url.searchParams.set("filter", "type:posted-content,prefix:10.26434");
  url.searchParams.set("rows", "10");
  url.searchParams.set("sort", "published");
  url.searchParams.set("order", "desc");

  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`ChemRxiv Crossref failed: ${resp.status}`);

  const paper = selectFreshPaper(parseCrossrefChemrxivItems(await resp.json()), "ChemRxiv", history);
  return paper || unavailablePaper("ChemRxiv", "Crossref 目前沒有回傳 ChemRxiv 論文。", "https://chemrxiv.org/");
}

async function fetchTaiwanChineseThesis() {
  const url = new URL(TAIWAN_THESES_URL);
  url.searchParams.set("o", "dwebmge");
  url.searchParams.set("ssoauth", "1");

  const resp = await fetch(url, {
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (!resp.ok) throw new Error(`Taiwan theses failed: ${resp.status}`);

  const html = await resp.text();
  if (/驗證碼檢查機制|validinput|random_validationimgs/.test(html)) {
    return unavailablePaper(
      "臺灣博碩士論文知識加值系統 國文",
      "臺灣博碩士論文知識加值系統目前要求圖形驗證碼，無法由排程機器抓取最新國文論文內容。",
      "https://ndltd.ncl.edu.tw/"
    );
  }

  return unavailablePaper(
    "臺灣博碩士論文知識加值系統 國文",
    "臺灣博碩士論文知識加值系統沒有提供可穩定解析的公開 API；本次未取得國文論文。",
    "https://ndltd.ncl.edu.tw/"
  );
}

async function fetchDoajArchaeologyPaper(history) {
  const url = new URL(DOAJ_ARTICLES_URL);
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", "10");

  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`DOAJ failed: ${resp.status}`);

  const paper = selectFreshPaper(parseDoajArticles(await resp.json()), "DOAJ archaeology", history);
  return paper || unavailablePaper("DOAJ archaeology", "DOAJ 目前沒有回傳考古學論文。", "https://doaj.org/");
}

async function fetchNatureCommunicationsFirstPaper(history) {
  const rssResponse = await fetch(NATURE_COMMUNICATIONS_RSS_URL, {
    headers: { Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
  });
  if (!rssResponse.ok) {
    throw new Error(`Nature Communications RSS failed: ${rssResponse.status}`);
  }

  const paper = selectFreshPaper(
    parseNatureCommunicationsFeedItems(await rssResponse.text(), 10),
    NATURE_COMMUNICATIONS_NAME,
    history
  );
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
      const topicTag = paper.topic ? ` [TOPIC: ${paper.topic}]` : "";
      const unavailableTag = paper.unavailable ? " [UNAVAILABLE SOURCE]" : "";
      const priorityTag = isPriorityPaper(paper) ? " [PRIORITY]" : "";
      return [
        `#${index + 1}${paper.fixedFirst ? " [MUST BE FIRST: Nature Communications]" : priorityTag}${topicTag}${unavailableTag}`,
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
    .concat("資料來源：Nature Communications RSS；arXiv 各主題 submittedDate 排序；ChemRxiv/Crossref；臺灣博碩士論文知識加值系統；DOAJ。")
    .join("\n");
}

async function createDigestResponse({ papers, normalizedMax, maxOutputTokens }) {
  return openai.responses.create({
    model: env.OPENAI_MODEL,
    max_output_tokens: maxOutputTokens,
    instructions: [
      "你是嚴謹的計算機科學研究助理。",
      "第 1 篇候選是 Nature Communications RSS 的首篇，必須原樣保留為輸出的第 1 篇，絕不可替換、略過或改變順序。",
      "第 2～8 篇必須依序保留 arXiv AI、IC-Design、FPGA、通訊、控制、Robotics、Computer-Architecture 各 1 篇。",
      "第 9～11 篇必須依序保留 ChemRxiv、臺灣博碩士論文知識加值系統國文、DOAJ archaeology 各 1 篇。",
      "每篇只翻譯提供的 abstract 為繁體中文，不要自行摘要、評論、延伸或加入重點。",
      "若某篇沒有 Abstract，改為翻譯其 Title 為繁體中文；不得以導語或猜測補寫 abstract。若標記 [UNAVAILABLE SOURCE]，保留原標題並把 Abstract 欄位的錯誤原因翻譯成繁體中文。",
      "每篇格式固定為：有 Abstract 時為「序號. 原標題\n中文 abstract：{繁體中文完整翻譯}\n原文：{Article URL}\nPDF：{PDF URL}」；沒有 Abstract 時為「序號. 原標題\n中文標題：{繁體中文標題翻譯}\n原文：{Article URL}\nPDF：{PDF URL}」。",
      "最後加一行：資料來源：Nature Communications RSS；arXiv 各主題 submittedDate 排序；ChemRxiv/Crossref；臺灣博碩士論文知識加值系統；DOAJ。",
    ].join("\n"),
    input: [
      `請輸出共 ${normalizedMax} 篇。來源順序固定，不要挑選或刪除候選。`,
      "候選論文如下：",
      buildPaperContext(papers),
    ].join("\n\n"),
  });
}

export async function buildLatestArxivPaperDigest({
  max = 11,
} = {}) {
  const normalizedMax = Math.max(Number(max) || 11, 11);
  const paperHistory = await loadPaperHistory();
  const [natureResult, arxivTopicsResult, chemrxivResult, taiwanThesisResult, doajResult] = await Promise.allSettled([
    fetchNatureCommunicationsFirstPaper(paperHistory),
    fetchArxivTopicPapers(paperHistory),
    fetchChemrxivPaper(paperHistory),
    fetchTaiwanChineseThesis(),
    fetchDoajArchaeologyPaper(paperHistory),
  ]);
  const naturePaper = natureResult.status === "fulfilled" ? natureResult.value : null;
  if (natureResult.status === "rejected") {
    console.warn("[arxivPaperService] Nature Communications fetch failed", natureResult.reason);
  }
  if (!naturePaper) {
    return "Nature Communications 目前無法取得 RSS 首篇論文，因此本次不提供論文摘要，以避免第 1 篇來源不符合設定。";
  }
  const arxivPapers = arxivTopicsResult.status === "fulfilled"
    ? arxivTopicsResult.value
    : ARXIV_TOPIC_QUERIES.map((topic) => unavailablePaper("arXiv", `arXiv ${topic.label} 抓取失敗。`));
  if (arxivTopicsResult.status === "rejected") {
    console.warn("[arxivPaperService] arXiv topic fetch failed", arxivTopicsResult.reason);
  }
  const chemrxivPaper = chemrxivResult.status === "fulfilled"
    ? chemrxivResult.value
    : unavailablePaper("ChemRxiv", `ChemRxiv 抓取失敗：${chemrxivResult.reason?.message || chemrxivResult.reason}`, "https://chemrxiv.org/");
  const taiwanThesisPaper = taiwanThesisResult.status === "fulfilled"
    ? taiwanThesisResult.value
    : unavailablePaper("臺灣博碩士論文知識加值系統 國文", `臺灣博碩士論文抓取失敗：${taiwanThesisResult.reason?.message || taiwanThesisResult.reason}`, "https://ndltd.ncl.edu.tw/");
  const doajPaper = doajResult.status === "fulfilled"
    ? doajResult.value
    : unavailablePaper("DOAJ archaeology", `DOAJ 抓取失敗：${doajResult.reason?.message || doajResult.reason}`, "https://doaj.org/");

  const papers = [
    naturePaper,
    ...arxivPapers,
    chemrxivPaper,
    taiwanThesisPaper,
    doajPaper,
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
  rememberPapers(paperHistory, papers);
  await savePaperHistory(paperHistory);

  return result;
}
