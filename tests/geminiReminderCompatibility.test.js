import test from "node:test";
import assert from "node:assert/strict";

process.env.CWA_API_KEY ||= "test";
process.env.FINNHUB_API_KEY ||= "test";
process.env.LINE_CHANNEL_SECRET ||= "test";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test";
process.env.PUBLISHED_SHEET_CSV_URL ||= "https://example.com/test.csv";
process.env.GEMINI_API_KEY ||= "test";
process.env.LLM_PROVIDER ||= "gemini";

const [{ botTools }, { buildGeminiFunctionDeclarations }, reminderContent, llmService] = await Promise.all([
  import("../src/llm/tools.js"),
  import("../src/services/geminiLlmService.js"),
  import("../src/services/reminderContentService.js"),
  import("../src/services/llmService.js"),
]);

test("detects an OpenAI response chain with missing tool output", () => {
  assert.equal(llmService.isBrokenOpenAiToolChain({
    status: 400,
    message: "No tool output found for function call call_123.",
  }), true);
  assert.equal(llmService.isBrokenOpenAiToolChain({
    status: 429,
    message: "Rate limit exceeded",
  }), false);
});

test("Gemini reminder schema requires only routing-critical fields", () => {
  const declaration = buildGeminiFunctionDeclarations(botTools)
    .find((tool) => tool.name === "create_reminder");

  assert.ok(declaration);
  assert.deepEqual(
    declaration.parametersJsonSchema.required,
    ["time", "recurrence", "reminderType"],
  );
  assert.equal(declaration.parametersJsonSchema.properties.paperCount, undefined);
});

test("daily reminders advance to the next future occurrence", () => {
  const next = reminderContent.getNextReminderTime(
    {
      time: new Date("2026-09-25T08:00:00+08:00"),
      recurrence: "daily",
    },
    new Date("2026-09-25T09:00:00+08:00"),
  );

  assert.equal(next.toISOString(), "2026-09-26T00:00:00.000Z");
});

test("weekly reminders advance to the requested Taipei weekday", () => {
  const next = reminderContent.getNextReminderTime(
    {
      time: new Date("2026-09-25T08:00:00+08:00"),
      recurrence: "weekly",
      weekDays: [1],
    },
    new Date("2026-09-25T09:00:00+08:00"),
  );

  assert.equal(next.toISOString(), "2026-09-28T00:00:00.000Z");
});
