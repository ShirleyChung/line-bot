import express from "express";
import { verifyRequest } from "./auth.js";
import { estimateEngineeringSize } from "../triage/estimate.js";
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
  if (outcome.status === "deferred") {
    return [
      "這個需求我已存入未來目標。",
      `估算工程量約 ${estimate.estimatedMinutes} 分鐘，超過目前 10 分鐘自動處理門檻。`,
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
    if (estimate.shouldDefer) {
      outcome = { status: "deferred", ...(await createFutureGoal(request, estimate)) };
    } else {
      const job = await createImplementationJob(request, estimate);
      const agentState = await startAgentRun({ job, request, estimate });
      outcome = {
        status: agentState.status || job.status,
        ...job,
        ...agentState,
      };
    }

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
