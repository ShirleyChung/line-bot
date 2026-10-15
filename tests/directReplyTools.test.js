import test from "node:test";
import assert from "node:assert/strict";

process.env.CWA_API_KEY ||= "test";
process.env.FINNHUB_API_KEY ||= "test";
process.env.LINE_CHANNEL_SECRET ||= "test";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test";
process.env.PUBLISHED_SHEET_CSV_URL ||= "https://example.com/test.csv";

const [{ getDirectReplyText, contextForDirectReply }, { formatReminderLine }] = await Promise.all([
  import("../src/llm/directReplyTools.js"),
  import("../src/llm/toolDispatcher.js"),
]);

test("direct reply text is returned only for user-ready tools", () => {
  assert.equal(getDirectReplyText("get_stock_price", { text: "台積電 1000" }), "台積電 1000");
  assert.equal(getDirectReplyText("get_weather", { replyText: "晴" }), "晴");
  assert.equal(getDirectReplyText("create_reminder", { replyText: "✅ 已設定提醒" }), "✅ 已設定提醒");
  assert.equal(getDirectReplyText("web_search", { text: "raw results" }), null);
  assert.equal(getDirectReplyText("get_weather", {}), null);
});

test("action confirmations are never emailed", () => {
  const context = { emailRecipient: "a@example.com" };
  assert.equal(contextForDirectReply(["create_reminder"], context).emailRecipient, "");
  assert.equal(contextForDirectReply(["send_email"], context).emailRecipient, "");
  assert.equal(contextForDirectReply(["get_stock_price"], context), context);
});

test("reminder lines render Taipei time by recurrence", () => {
  const time = new Date("2026-10-15T08:30:00+08:00");
  assert.equal(
    formatReminderLine({ time, recurrence: "daily", action: "台北天氣" }),
    "每天 08:30：台北天氣",
  );
  assert.equal(
    formatReminderLine({ time, recurrence: "weekly", weekDays: [1, 3, 5], action: "自選股股價" }),
    "每週一、三、五 08:30：自選股股價",
  );
  assert.match(
    formatReminderLine({ time, recurrence: "none", action: "開會", emailRecipient: "a@example.com" }),
    /^2026\/10\/15 08:30：開會（寄到 a@example\.com）$/,
  );
});
