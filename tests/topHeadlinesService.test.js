import test from "node:test";
import assert from "node:assert/strict";

process.env.CWA_API_KEY ||= "x";
process.env.FINNHUB_API_KEY ||= "x";
process.env.LINE_CHANNEL_SECRET ||= "x";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "x";
process.env.PUBLISHED_SHEET_CSV_URL ||= "https://example.com";
process.env.OPENAI_API_KEY ||= "x";

const { buildTopHeadlinesMessage } = await import("../src/services/topHeadlinesService.js");

test("top-headline message never falls back to an English title when translation is unavailable", () => {
  const message = buildTopHeadlinesMessage([
    {
      source: "BBC",
      title: "An English headline that must not be shown as a summary",
      summary: "中文摘要暫時無法產生，請開啟原文連結閱覽",
      url: "https://example.com/news",
      publishedAt: "2026-06-21T01:00:00.000Z",
    },
  ]);

  assert.match(message, /中文摘要暫時無法產生/);
  assert.doesNotMatch(message, /An English headline/);
});

test("top-headline message protects against older cached data with no summary", () => {
  const message = buildTopHeadlinesMessage([
    {
      source: "CNN",
      title: "Cached English title without a translated summary",
      url: "https://example.com/cached",
    },
  ]);

  assert.match(message, /中文摘要暫時無法產生/);
  assert.doesNotMatch(message, /Cached English title/);
});

test("top-headline message displays the supplied Traditional Chinese summary", () => {
  const message = buildTopHeadlinesMessage([
    {
      source: "Reuters",
      title: "Original English title",
      summary: "國際市場因政策消息出現明顯波動",
      url: "https://example.com/market",
    },
  ]);

  assert.match(message, /國際市場因政策消息出現明顯波動/);
  assert.doesNotMatch(message, /Original English title/);
});
