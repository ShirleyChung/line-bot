import test from "node:test";
import assert from "node:assert/strict";

process.env.CWA_API_KEY ||= "x";
process.env.FINNHUB_API_KEY ||= "x";
process.env.LINE_CHANNEL_SECRET ||= "x";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "x";
process.env.PUBLISHED_SHEET_CSV_URL ||= "https://example.com";
process.env.OPENAI_API_KEY ||= "x";

const parkingHandler = await import("../src/handlers/parkingHandler.js");

const {
  isNearbyFacilityIntent,
  parseNearbyFacilityQuery,
} = parkingHandler;

test("ITF junior tournament query should not be parsed as nearby facility search", () => {
  const text = "查詢 7月分，在 manila的TIF junior比賽的詳細資訊";

  assert.equal(isNearbyFacilityIntent(text), false);
  assert.equal(parseNearbyFacilityQuery(text), null);
});

test("general nearby facility query should still be parsed", () => {
  const text = "台北101附近咖啡廳";

  assert.equal(isNearbyFacilityIntent(text), true);
  assert.deepEqual(parseNearbyFacilityQuery(text), {
    location: "台北101",
    facility: "咖啡廳",
  });
});

test("nearby parking query should still be parsed", () => {
  const text = "找淡江大橋附近停車場";

  assert.equal(isNearbyFacilityIntent(text), true);
  assert.deepEqual(parseNearbyFacilityQuery(text), {
    location: "淡江大橋",
    facility: "停車場",
  });
});
