import { env } from "../config/env.js";

function buildBranchName(requestId) {
  return `codex/evolve-${requestId.slice(0, 12)}`;
}

function buildPrTitle(request) {
  const summary = String(request.userText || "Update line-bot capability")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
  return `[evolveEngine] ${summary}`;
}

function buildCodexPrompt({ request, estimate }) {
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
