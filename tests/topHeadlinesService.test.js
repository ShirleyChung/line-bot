import test from "node:test";
import assert from "node:assert/strict";

process.env.CWA_API_KEY ||= "x";
process.env.FINNHUB_API_KEY ||= "x";
process.env.LINE_CHANNEL_SECRET ||= "x";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "x";
process.env.PUBLISHED_SHEET_CSV_URL ||= "https://example.com";
process.env.OPENAI_API_KEY ||= "x";

const {
  buildTopHeadlinesMessage,
  mergeHeadlines,
  parseXinhuaWorldPageItems,
} = await import("../src/services/topHeadlinesService.js");

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

test("Xinhua world page parser extracts current list items", () => {
  const items = parseXinhuaWorldPageItems(`
    <div class="item">
      <div class="tit"><a href="../20260705/50945641b3a643dd95948d93dd7e2ae5/c.html" target="_blank">Top DPRK leader oversees weapon system performance test</a><span class="time">2026-07-05 10:59:15</span></div>
    </div>
  `);

  assert.equal(items.length, 1);
  assert.equal(items[0].source, "新華社");
  assert.equal(items[0].title, "Top DPRK leader oversees weapon system performance test");
  assert.equal(items[0].url, "https://english.news.cn/20260705/50945641b3a643dd95948d93dd7e2ae5/c.html");
  assert.equal(items[0].publishedAt, "2026-07-05T02:59:15.000Z");
});

test("top-headline merge excludes stale dated articles such as old Xinhua RSS entries", () => {
  const headlines = mergeHeadlines(
    [
      {
        source: "新華社",
        title: "Old Xinhua RSS item",
        url: "https://example.com/old-xinhua",
        publishedAt: "2018-04-28T08:16:24.000Z",
      },
      {
        source: "BBC",
        title: "Current BBC item",
        url: "https://example.com/current-bbc",
        publishedAt: new Date().toISOString(),
      },
    ],
    10,
  );

  assert.deepEqual(
    headlines.map((item) => item.title),
    ["Current BBC item"],
  );
});
