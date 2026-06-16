import { env } from "../config/env.js";
import { updateImplementationJob } from "../store/evolveRepository.js";
import { buildCodexWorkflow } from "./codexWorkflow.js";

export async function startAgentRun({ job, request, estimate }) {
  if (env.EVOLVE_AGENT_MODE === "manual") {
    return updateImplementationJob(job.id, {
      status: "pending_manual_review",
      logsSummary:
        "Automatic Codex/Copilot execution is disabled. Review this job before enabling agent execution.",
    });
  }

  if (!["codex", "copilot"].includes(env.EVOLVE_AGENT_MODE)) {
    return updateImplementationJob(job.id, {
      status: "agent_not_configured",
      logsSummary: `Unsupported EVOLVE_AGENT_MODE: ${env.EVOLVE_AGENT_MODE}`,
    });
  }

  if (env.EVOLVE_AGENT_MODE === "codex") {
    const workflow = buildCodexWorkflow({ job, request, estimate });
    return updateImplementationJob(job.id, {
      status: "awaiting_codex_pr",
      branch: workflow.branch,
      codexWorkflow: workflow,
      logsSummary:
        "Codex PR workflow prepared. A Codex worker should create the PR, wait for merge, pull the base branch, and deploy line-bot.",
    });
  }

  return updateImplementationJob(job.id, {
    status: "awaiting_agent_adapter",
    logsSummary:
      `${env.EVOLVE_AGENT_MODE} adapter is selected but not implemented yet. ` +
      `Request ${request.id} is ready for the next implementation phase.`,
  });
}
