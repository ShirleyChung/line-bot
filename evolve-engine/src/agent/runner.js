import { env } from "../config/env.js";
import { updateImplementationJob } from "../store/evolveRepository.js";
import { buildCodexWorkflow } from "./codexWorkflow.js";
import { createCodexIssueTrigger } from "./githubCodexTrigger.js";

export async function startAgentRun({ job, request, estimate }) {
  // manual 是保守預設：只建立 job，不讓服務自動修改程式碼或部署。
  if (env.EVOLVE_AGENT_MODE === "manual") {
    return updateImplementationJob(job.id, {
      status: "pending_manual_review",
      logsSummary:
        "Automatic Codex/Copilot execution is disabled. Review this job before enabling agent execution.",
    });
  }

  // 只接受明確列出的 agent 模式，避免環境變數打錯時進入未知流程。
  if (!["codex", "copilot"].includes(env.EVOLVE_AGENT_MODE)) {
    return updateImplementationJob(job.id, {
      status: "agent_not_configured",
      logsSummary: `Unsupported EVOLVE_AGENT_MODE: ${env.EVOLVE_AGENT_MODE}`,
    });
  }

  // Codex 模式目前只準備 workflow 狀態，實際開分支、PR、部署交給外部 worker 執行。
  if (env.EVOLVE_AGENT_MODE === "codex") {
    const workflow = buildCodexWorkflow({ job, request, estimate });

    if (env.EVOLVE_CODEX_TRIGGER_MODE === "github_issue") {
      if (!env.EVOLVE_GITHUB_TOKEN) {
        return updateImplementationJob(job.id, {
          status: "codex_trigger_not_configured",
          branch: workflow.branch,
          codexWorkflow: workflow,
          logsSummary:
            "Codex workflow prepared, but EVOLVE_GITHUB_TOKEN is not set. " +
            "Set a GitHub token with issue write access so evolveEngine can create an @codex issue.",
        });
      }

      try {
        const codexIssue = await createCodexIssueTrigger({
          githubToken: env.EVOLVE_GITHUB_TOKEN,
          workflow,
          request,
          estimate,
        });

        return updateImplementationJob(job.id, {
          status: "awaiting_codex_pr",
          branch: workflow.branch,
          codexWorkflow: {
            ...workflow,
            trigger: {
              type: "github_issue",
              status: "created",
              ...codexIssue,
            },
          },
          codexIssue,
          logsSummary:
            `Created GitHub issue ${codexIssue.issueUrl} with @codex instructions. ` +
            "Codex cloud should pick up the issue, modify the repository, and open a PR for review.",
        });
      } catch (error) {
        return updateImplementationJob(job.id, {
          status: "codex_trigger_failed",
          branch: workflow.branch,
          codexWorkflow: workflow,
          logsSummary: error?.message || "Failed to create Codex GitHub issue.",
        });
      }
    }

    return updateImplementationJob(job.id, {
      status: "awaiting_codex_pr",
      branch: workflow.branch,
      codexWorkflow: workflow,
      logsSummary:
        "Codex PR workflow prepared. A Codex worker should create the PR, wait for merge, pull the base branch, and deploy line-bot.",
    });
  }

  // copilot adapter 尚未實作；先保留狀態讓需求不會遺失。
  return updateImplementationJob(job.id, {
    status: "awaiting_agent_adapter",
    logsSummary:
      `${env.EVOLVE_AGENT_MODE} adapter is selected but not implemented yet. ` +
      `Request ${request.id} is ready for the next implementation phase.`,
  });
}
