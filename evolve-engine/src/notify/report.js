import { env } from "../config/env.js";
import { sendEmail } from "../services/emailService.js";

function buildReportBody({ request, estimate, outcome }) {
  // 通知信保留估算原因與 outcome，方便維護者不用查 Firestore 也能判斷下一步。
  const lines = [
    "evolveEngine 收到新的工具演進需求。",
    "",
    `Request ID: ${request.id}`,
    `Status: ${outcome.status}`,
    `Estimated minutes: ${estimate.estimatedMinutes}`,
    `Size: ${estimate.size}`,
    `Confidence: ${estimate.confidence}`,
    "",
    "Reasons:",
    ...estimate.reasons.map((reason) => `- ${reason}`),
    "",
    "User request:",
    request.userText,
    "",
    `Missing capability: ${request.missingCapability || "(not specified)"}`,
    `Expected behavior: ${request.expectedBehavior || "(not specified)"}`,
    "",
    `Outcome ID: ${outcome.id}`,
  ];

  // Codex workflow 存在時，把後續 worker 需要追蹤的 branch、PR 與部署指令一起列出。
  if (outcome.codexWorkflow) {
    lines.push(
      "",
      "Codex workflow:",
      `- Repository: ${outcome.codexWorkflow.repository}`,
      `- Base branch: ${outcome.codexWorkflow.baseBranch}`,
      `- Work branch: ${outcome.codexWorkflow.branch}`,
      `- PR title: ${outcome.codexWorkflow.prTitle}`,
      `- Post-merge pull: ${outcome.codexWorkflow.postMerge.pullCommand}`,
      `- Post-merge deploy: ${outcome.codexWorkflow.postMerge.deployCommand}`
    );

    if (outcome.codexWorkflow.trigger) {
      lines.push(
        `- Trigger type: ${outcome.codexWorkflow.trigger.type}`,
        `- Trigger status: ${outcome.codexWorkflow.trigger.status}`,
        `- Codex issue: ${outcome.codexWorkflow.trigger.issueUrl || "(not created)"}`
      );
    }
  }

  return lines.join("\n");
}

export async function notifyReport({ request, estimate, outcome }) {
  // subject 放入 Deferred/Queued，可在信箱中快速分辨是否需要人工處理。
  const subjectPrefix = outcome.status === "deferred" ? "Deferred" : "Queued";
  return sendEmail({
    to: env.EVOLVE_REPORT_EMAIL,
    subject: `[evolveEngine] ${subjectPrefix}: ${request.userText.slice(0, 80)}`,
    body: buildReportBody({ request, estimate, outcome }),
  });
}
