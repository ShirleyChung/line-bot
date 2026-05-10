import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import OpenAI from "openai";
import { env } from "../config/env.js";

const client = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

const MAX_URLS = 3;
const MAX_FETCH_BYTES = 800_000;
const MAX_TEXT_CHARS_PER_PAGE = 18_000;
const REQUEST_TIMEOUT_MS = 12_000;
const LINE_TEXT_LIMIT = 4_800;
const MAX_REDIRECTS = 3;
const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

export function extractHttpUrls(text = "") {
  const matches = text.match(/https?:\/\/[^\s<>"'，。！？、）)\]]+/gi) || [];
  const urls = [];
  const seen = new Set();

  for (const match of matches) {
    const cleaned = match.replace(/[.,;:!?]+$/g, "");
    try {
      const url = new URL(cleaned);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      const normalized = url.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      urls.push(normalized);
    } catch {
      // Ignore malformed URL-like text.
    }
  }

  return urls;
}

export function containsHttpUrl(text = "") {
  return extractHttpUrls(text).length > 0;
}

function decodeHtmlEntities(text = "") {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body) => {
    if (body[0] === "#") {
      const radix = body[1]?.toLowerCase() === "x" ? 16 : 10;
      const value = parseInt(radix === 16 ? body.slice(2) : body.slice(1), radix);
      return Number.isFinite(value) ? String.fromCodePoint(value) : entity;
    }
    return named[body.toLowerCase()] || entity;
  });
}

function extractTagContent(html, pattern) {
  const match = html.match(pattern);
  return match ? decodeHtmlEntities(match[1].replace(/\s+/g, " ").trim()) : "";
}

function htmlToReadableText(html = "") {
  const title = extractTagContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = extractTagContent(
    html,
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["'][^>]*>/i
  );

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|header|footer|main|li|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const text = decodeHtmlEntities([title, description, body].filter(Boolean).join("\n\n"))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.slice(0, MAX_TEXT_CHARS_PER_PAGE);
}

function textFromResponse(body, contentType = "") {
  if (/html|xml/i.test(contentType)) {
    return htmlToReadableText(body);
  }

  return decodeHtmlEntities(body)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS_PER_PAGE);
}

function isBlockedIpv4(host) {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(host) {
  const normalized = host.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function isBlockedIp(host) {
  const version = isIP(host);
  if (version === 4) return isBlockedIpv4(host);
  if (version === 6) return isBlockedIpv6(host);
  return false;
}

async function assertFetchAllowed(url) {
  const { hostname } = new URL(url);
  const normalizedHost = hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(normalizedHost) || isBlockedIp(normalizedHost)) {
    throw new Error("不支援抓取 localhost 或內網網址");
  }

  const addresses = await lookup(normalizedHost, { all: true, verbatim: true });
  if (addresses.some((item) => isBlockedIp(item.address))) {
    throw new Error("網址解析到內網位址，已停止抓取");
  }
}

async function readLimitedText(response) {
  const reader = response.body?.getReader();
  if (!reader) {
    return (await response.text()).slice(0, MAX_FETCH_BYTES);
  }

  const chunks = [];
  let total = 0;

  while (total < MAX_FETCH_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const next = value.slice(0, Math.max(0, MAX_FETCH_BYTES - total));
    chunks.push(next);
    total += next.byteLength;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function fetchAllowedUrl(url, options, redirectCount = 0) {
  await assertFetchAllowed(url);

  const response = await fetch(url, {
    ...options,
    redirect: "manual",
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirectCount >= MAX_REDIRECTS) {
      throw new Error("重新導向次數過多");
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`HTTP ${response.status} 但缺少重新導向位置`);
    }

    const nextUrl = new URL(location, url).toString();
    return fetchAllowedUrl(nextUrl, options, redirectCount + 1);
  }

  return response;
}

async function fetchWebpageText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchAllowedUrl(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 line-bot webpage summarizer",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!/html|xml|text|json/i.test(contentType)) {
      throw new Error(`不支援的內容類型：${contentType || "unknown"}`);
    }

    const body = await readLimitedText(response);
    const text = textFromResponse(body, contentType);
    if (text.length < 80) {
      throw new Error("網頁可讀文字太少，可能需要登入或由 JavaScript 動態載入");
    }

    return {
      url,
      finalUrl: response.url || url,
      contentType,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function trimForLine(text) {
  if (text.length <= LINE_TEXT_LIMIT) return text;
  return `${text.slice(0, LINE_TEXT_LIMIT - 20).trim()}\n\n（內容已截斷）`;
}

export async function summarizeUrlsFromText(userText = "") {
  if (!env.OPENAI_API_KEY) {
    return "目前尚未設定 OpenAI API Key，無法摘要網頁。";
  }

  const urls = extractHttpUrls(userText).slice(0, MAX_URLS);
  if (!urls.length) return null;

  const pages = [];
  const failures = [];

  for (const url of urls) {
    try {
      pages.push(await fetchWebpageText(url));
    } catch (error) {
      failures.push({
        url,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!pages.length) {
    return [
      "我抓不到這些網址的可摘要內容。",
      ...failures.map((item) => `${item.url}\n原因：${item.message}`),
    ].join("\n\n");
  }

  const input = pages
    .map((page, index) => {
      return [
        `URL ${index + 1}: ${page.finalUrl}`,
        "內容：",
        page.text,
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    max_output_tokens: env.OPENAI_MAX_OUTPUT_TOKENS,
    instructions: [
      "你是網頁內容摘要助手。請用繁體中文回覆。",
      "根據提供的網頁文字摘要，不要編造網頁文字中沒有的資訊。",
      "輸出格式：先給 3-6 點重點摘要，再給「適合誰看」與「需要注意」。",
      "如果有多個 URL，請分開標示每個網址的摘要。",
      "回覆要適合 LINE 訊息閱讀，簡潔但保留關鍵細節。",
    ].join("\n"),
    input,
  });

  const summary = response.output_text?.trim() || "我暫時無法產生網頁摘要。";
  const failureText = failures.length
    ? `\n\n以下網址抓取失敗：\n${failures.map((item) => `${item.url}\n原因：${item.message}`).join("\n\n")}`
    : "";

  return trimForLine(`${summary}${failureText}`);
}
