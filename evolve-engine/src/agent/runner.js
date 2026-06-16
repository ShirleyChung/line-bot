import { env } from "../config/env.js";
import { updateImplementationJob } from "../store/evolveRepository.js";

export async function startAgentRun({ job, request }) {
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

  return updateImplementationJob(job.id, {
    status: "awaiting_agent_adapter",
    logsSummary:
      `${env.EVOLVE_AGENT_MODE} adapter is selected but not implemented yet. ` +
      `Request ${request.id} is ready for the next implementation phase.`,
  });
}
