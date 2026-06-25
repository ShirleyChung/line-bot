import assert from "node:assert/strict";
import test from "node:test";

import { parseEmailCommand } from "../src/utils/emailCommand.js";
import { normalizeEmailRecipients } from "../src/utils/emailRecipients.js";

test("parseEmailCommand extracts multiple Chinese-separated recipients", () => {
  const result = parseEmailCommand(
    "寄給jonesr_tw@yahoo.com.tw及shirley@mail.kway.com.tw及aaaa@bbbb.com 當天的論文"
  );

  assert.deepEqual(result.recipients, [
    "jonesr_tw@yahoo.com.tw",
    "shirley@mail.kway.com.tw",
    "aaaa@bbbb.com",
  ]);
  assert.equal(result.to, "jonesr_tw@yahoo.com.tw, shirley@mail.kway.com.tw, aaaa@bbbb.com");
  assert.equal(result.requestText, "當天的論文");
});

test("normalizeEmailRecipients deduplicates and formats comma recipients", () => {
  assert.equal(
    normalizeEmailRecipients("A@example.com, a@example.com 和 b@example.com"),
    "A@example.com, b@example.com"
  );
});
