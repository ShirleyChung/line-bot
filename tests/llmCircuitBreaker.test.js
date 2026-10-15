import test from "node:test";
import assert from "node:assert/strict";

process.env.CWA_API_KEY ||= "test";
process.env.FINNHUB_API_KEY ||= "test";
process.env.LINE_CHANNEL_SECRET ||= "test";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test";
process.env.PUBLISHED_SHEET_CSV_URL ||= "https://example.com/test.csv";

const { guardLlmCall, resetLlmCircuit, LLM_CIRCUIT_OPEN_CODE } =
  await import("../src/services/llmCircuitBreaker.js");

test("quota errors open the circuit immediately and block further calls", async () => {
  resetLlmCircuit();
  let calls = 0;
  const quotaError = Object.assign(new Error("You exceeded your current quota"), {
    status: 429,
    code: "insufficient_quota",
  });

  await assert.rejects(guardLlmCall(async () => { calls++; throw quotaError; }));
  await assert.rejects(
    guardLlmCall(async () => { calls++; return "ok"; }),
    (error) => error.code === LLM_CIRCUIT_OPEN_CODE,
  );
  assert.equal(calls, 1);
});

test("transient errors open the circuit only after repeated failures", async () => {
  resetLlmCircuit();
  const serverError = Object.assign(new Error("server error"), { status: 503 });

  await assert.rejects(guardLlmCall(async () => { throw serverError; }));
  await assert.rejects(guardLlmCall(async () => { throw serverError; }));
  assert.equal(await guardLlmCall(async () => "ok"), "ok");

  for (let i = 0; i < 3; i++) {
    await assert.rejects(guardLlmCall(async () => { throw serverError; }));
  }
  await assert.rejects(
    guardLlmCall(async () => "ok"),
    (error) => error.code === LLM_CIRCUIT_OPEN_CODE,
  );
  resetLlmCircuit();
});

test("ordinary request errors do not open the circuit", async () => {
  resetLlmCircuit();
  const badRequest = Object.assign(new Error("No tool output found"), { status: 400 });
  for (let i = 0; i < 5; i++) {
    await assert.rejects(guardLlmCall(async () => { throw badRequest; }));
  }
  assert.equal(await guardLlmCall(async () => "ok"), "ok");
});
