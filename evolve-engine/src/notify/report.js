import { env } from "../config/env.js";
import { sendEmail } from "../services/emailService.js";

function buildReportBody({ request, estimate, outcome }) {
  return [
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
  ].join("\n");
}

export async function notifyReport({ request, estimate, outcome }) {
  const subjectPrefix = outcome.status === "deferred" ? "Deferred" : "Queued";
  return sendEmail({
    to: env.EVOLVE_REPORT_EMAIL,
    subject: `[evolveEngine] ${subjectPrefix}: ${request.userText.slice(0, 80)}`,
    body: buildReportBody({ request, estimate, outcome }),
  });
}
