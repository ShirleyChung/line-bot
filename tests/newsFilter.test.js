import test from "node:test";
import assert from "node:assert/strict";

const { isBlockedNewsUrl } = await import("../src/utils/newsFilter.js");
const { buildNewsMessage } = await import("../src/utils/format.js");

test("news filter blocks flipso.com and its subdomains", () => {
  assert.equal(isBlockedNewsUrl("https://flipso.com/story"), true);
  assert.equal(isBlockedNewsUrl("https://www.flipso.com/story"), true);
  assert.equal(isBlockedNewsUrl("https://ads.flipso.com/story"), true);
});

test("news filter does not block unrelated lookalike domains", () => {
  assert.equal(isBlockedNewsUrl("https://flipso.com.example.org/story"), false);
  assert.equal(isBlockedNewsUrl("https://example.com/news"), false);
});

test("news message output excludes blocked ad-site articles", () => {
  const message = buildNewsMessage([
    {
      title: "廣告站新聞",
      url: "https://flipso.com/ad-story",
      source: "Flipso",
      provider: "Brave",
    },
    {
      title: "可信新聞",
      url: "https://example.com/news",
      source: "Example",
      provider: "Brave",
    },
  ], "國際新聞");

  assert.match(message, /可信新聞/);
  assert.doesNotMatch(message, /廣告站新聞/);
  assert.doesNotMatch(message, /flipso\.com/);
});
