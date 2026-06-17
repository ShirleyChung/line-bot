import test from "node:test";
import assert from "node:assert/strict";
import { buildCodexWorkflow } from "../src/agent/codexWorkflow.js";
import {
  buildCodexIssuePayload,
  createCodexIssueTrigger,
} from "../src/agent/githubCodexTrigger.js";

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

test("codex GitHub issue payload tags Codex and includes implementation context", () => {
  const request = {
    id: "abcdefghijklmnop",
    userText: "幫 line-bot 新增查詢工具",
    reason: "目前工具做不到",
    missingCapability: "查詢新資料源",
    expectedBehavior: "使用者詢問時回覆查詢結果",
  };
  const estimate = { estimatedMinutes: 10 };
  const workflow = buildCodexWorkflow({
    job: { id: "job-1" },
    request,
    estimate,
  });

  const payload = buildCodexIssuePayload({ workflow, request, estimate });

  assert.equal(payload.title, workflow.prTitle);
  assert.deepEqual(payload.labels, ["evolve-engine", "codex"]);
  assert.match(payload.body, /^@codex Please implement/m);
  assert.match(payload.body, /Repository: ShirleyChung\/line-bot/);
  assert.match(payload.body, /Base branch: master/);
  assert.match(payload.body, /Open a draft PR/);
});

test("codex GitHub trigger creates issue through GitHub API", async () => {
  const request = {
    id: "abcdefghijklmnop",
    userText: "幫 line-bot 新增查詢工具",
  };
  const estimate = { estimatedMinutes: 10 };
  const workflow = buildCodexWorkflow({
    job: { id: "job-1" },
    request,
    estimate,
  });

  const calls = [];
  const result = await createCodexIssueTrigger({
    githubToken: "token-123",
    workflow,
    request,
    estimate,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify({
          number: 123,
          html_url: "https://github.com/ShirleyChung/line-bot/issues/123",
          url: "https://api.github.com/repos/ShirleyChung/line-bot/issues/123",
        }),
        { status: 201 }
      );
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.github.com/repos/ShirleyChung/line-bot/issues");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.authorization, "Bearer token-123");
  assert.equal(result.issueNumber, 123);
  assert.equal(result.issueUrl, "https://github.com/ShirleyChung/line-bot/issues/123");
});
