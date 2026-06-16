import test from "node:test";
import assert from "node:assert/strict";
import { estimateEngineeringSize } from "../src/triage/estimate.js";

test("small wording or format changes stay under the automatic threshold", () => {
  const estimate = estimateEngineeringSize({
    userText: "幫我把天氣回覆格式多加一個降雨機率欄位",
    expectedBehavior: "查天氣時回覆多顯示降雨機率",
  });

  assert.equal(estimate.shouldDefer, false);
  assert.equal(estimate.size, "small");
});

test("integration and deployment requests are deferred", () => {
  const estimate = estimateEngineeringSize({
    userText: "幫我串接新的 API，新增工具、測試，並部署到 Cloud Run",
    expectedBehavior: "使用者可以查詢新 API 的資料",
  });

  assert.equal(estimate.shouldDefer, true);
  assert.match(estimate.reasons.join("\n"), /工程訊號/);
});
