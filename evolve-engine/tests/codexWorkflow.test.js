import test from "node:test";
import assert from "node:assert/strict";
import { buildCodexWorkflow } from "../src/agent/codexWorkflow.js";

test("codex workflow prepares PR and post-merge line-bot deployment steps", () => {
  const workflow = buildCodexWorkflow({
    job: { id: "job-1" },
    request: {
      id: "abcdefghijklmnop",
      userText: "幫 line-bot 新增查詢工具",
      reason: "目前工具做不到",
      missingCapability: "查詢新資料源",
      expectedBehavior: "使用者詢問時回覆查詢結果",
    },
    estimate: {
      estimatedMinutes: 10,
    },
  });

  assert.equal(workflow.provider, "codex");
  assert.equal(workflow.repository, "ShirleyChung/line-bot");
  assert.equal(workflow.baseBranch, "master");
  assert.equal(workflow.branch, "codex/evolve-abcdefghijkl");
  assert.match(workflow.prTitle, /^\[evolveEngine\]/);
  assert.match(workflow.codexPrompt, /Create a branch/);
  assert.equal(workflow.postMerge.pullCommand, "git pull --ff-only origin master");
  assert.equal(
    workflow.postMerge.deployCommand,
    "gcloud run deploy line-bot --source . --region asia-east1 --allow-unauthenticated"
  );
});
