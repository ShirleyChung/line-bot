import { env } from "../config/env.js";

function buildBranchName(requestId) {
  // branch 名稱保留 requestId 前 12 碼，足夠追蹤來源且不會太長。
  return `codex/evolve-${requestId.slice(0, 12)}`;
}

function buildPrTitle(request) {
  // PR 標題壓到 72 字內，避免 GitHub 清單頁顯示過長。
  const summary = String(request.userText || "Update line-bot capability")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
  return `[evolveEngine] ${summary}`;
}

function buildCodexPrompt({ request, estimate }) {
  // 這段 prompt 是交給後續 Codex worker 的工作單，包含需求背景與必要交付流程。
  return [
    "You are modifying the line-bot repository for an evolveEngine request.",
    "",
    `Request ID: ${request.id}`,
    `User request: ${request.userText}`,
    `Reason: ${request.reason || "(not specified)"}`,
    `Missing capability: ${request.missingCapability || "(not specified)"}`,
    `Expected behavior: ${request.expectedBehavior || "(not specified)"}`,
    `Estimated minutes: ${estimate.estimatedMinutes}`,
    "",
    "Required workflow:",
    "1. Create a branch from the configured base branch.",
    "2. Implement the line-bot change with focused tests where useful.",
    "3. Commit and open a pull request against the base branch.",
    "4. After the PR is merged, pull the latest base branch and deploy the updated line-bot service.",
  ].join("\n");
}

export function buildCodexWorkflow({ job, request, estimate }) {
  const baseBranch = env.EVOLVE_REPO_BASE_BRANCH;
  const branch = buildBranchName(request.id);

  // workflow 只描述要做什麼，不直接執行 git 或部署；實作留給外部 worker。
  return {
    provider: "codex",
    repository: env.EVOLVE_REPO_FULL_NAME,
    baseBranch,
    branch,
    prTitle: buildPrTitle(request),
    codexPrompt: buildCodexPrompt({ request, estimate }),
    pr: {
      status: "pending",
      url: "",
      number: null,
      mergeCommitSha: "",
    },
    postMerge: {
      status: "waiting_for_merge",
      pullCommand: `git pull --ff-only origin ${baseBranch}`,
      deployCommand:
        "gcloud run deploy line-bot --source . --region asia-east1 --allow-unauthenticated",
      service: "line-bot",
    },
    jobId: job.id,
    requestId: request.id,
  };
}
