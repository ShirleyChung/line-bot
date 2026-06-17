import express from "express";
import { verifyRequest } from "./auth.js";
import { estimateEngineeringSize } from "../triage/estimate.js";
import { env } from "../config/env.js";
import {
  createFutureGoal,
  createImplementationJob,
  createRequest,
  saveEstimate,
} from "../store/evolveRepository.js";
import { notifyReport } from "../notify/report.js";
import { startAgentRun } from "../agent/runner.js";

export const requestsRouter = express.Router();

function normalizeRequestBody(body = {}) {
  // 對外 API 可能來自 LINE 或其他平台，這裡先把欄位正規化成 evolveEngine 內部格式。
  return {
    userText: String(body.userText || "").trim(),
    reason: String(body.reason || "").trim(),
    missingCapability: String(body.missingCapability || "").trim(),
    expectedBehavior: String(body.expectedBehavior || "").trim(),
    sessionKey: String(body.sessionKey || "").trim(),
    source: body.source && typeof body.source === "object" ? body.source : null,
    platform: String(body.platform || body.source?.platform || body.source?.type || "line").trim(),
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };
}

function buildReplyText({ request, estimate, outcome }) {
  // 回覆文字會交給呼叫端顯示給使用者，因此保持短句並附上追蹤 ID。
  if (outcome.status === "deferred") {
    return [
      "這個需求我已存入未來目標。",
      `估算工程量約 ${estimate.estimatedMinutes} 分鐘，超過目前 10 分鐘自動處理門檻。`,
      `追蹤 ID：${request.id}`,
    ].join("\n");
  }

  if (outcome.status === "awaiting_codex_pr") {
    const issueUrl = outcome.codexIssue?.issueUrl || outcome.codexWorkflow?.trigger?.issueUrl;
    return [
      "這個需求已建立 Codex PR 開發工作。",
      `估算工程量約 ${estimate.estimatedMinutes} 分鐘，等待 Codex 建立 PR。`,
      issueUrl ? `Codex issue：${issueUrl}` : "",
      "PR 合併後會拉取最新版並部署 line-bot。",
      `追蹤 ID：${request.id}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (outcome.status === "codex_trigger_not_configured") {
    return [
      "這個需求已建立 Codex 工作單，但尚未送出給 Codex cloud。",
      "請設定 EVOLVE_GITHUB_TOKEN，讓 evolveEngine 可以建立 @codex GitHub issue。",
      `追蹤 ID：${request.id}`,
    ].join("\n");
  }

  if (outcome.status === "codex_trigger_failed") {
    return [
      "這個需求已建立 Codex 工作單，但建立 @codex GitHub issue 失敗。",
      "請檢查 GitHub token 權限與 Codex cloud repo 連線。",
      `追蹤 ID：${request.id}`,
    ].join("\n");
  }

  return [
    "這個需求已建立 evolveEngine 開發工作。",
    `估算工程量約 ${estimate.estimatedMinutes} 分鐘，目前狀態：${outcome.status}。`,
    `追蹤 ID：${request.id}`,
  ].join("\n");
}

requestsRouter.post("/requests", verifyRequest, async (req, res) => {
  try {
    const payload = normalizeRequestBody(req.body);
    if (!payload.userText) {
      return res.status(400).json({
        ok: false,
        error: "userText is required",
      });
    }

    const request = await createRequest(payload);
    const estimate = estimateEngineeringSize(payload);
    await saveEstimate(request.id, estimate);

    let outcome;

    // 非 Codex 模式下，超過 10 分鐘門檻的需求只入 backlog，避免自動執行大改動。
    if (estimate.shouldDefer && env.EVOLVE_AGENT_MODE !== "codex") {
      outcome = { status: "deferred", ...(await createFutureGoal(request, estimate)) };
    } else {
      // 小型需求或 Codex 模式會建立 implementation job，再交給 agent runner 產生下一步狀態。
      const job = await createImplementationJob(request, estimate);
      const agentState = await startAgentRun({ job, request, estimate });
      outcome = {
        status: agentState.status || job.status,
        ...job,
        ...agentState,
      };
    }

    // 無論是延期或排程，都寄出摘要，讓維護者可以追蹤 evolveEngine 的決策。
    await notifyReport({ request, estimate, outcome });

    return res.status(201).json({
      ok: true,
      requestId: request.id,
      status: outcome.status,
      outcomeId: outcome.id,
      estimate,
      replyText: buildReplyText({ request, estimate, outcome }),
    });
  } catch (error) {
    console.error("[evolve-engine] create request failed", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "internal error",
    });
  }
});
