# evolve-engine

`evolve-engine` is a separate service for receiving line-bot capability requests that current tools cannot satisfy.

First-phase behavior:

- Accepts requests from `line-bot`.
- Estimates whether implementation looks larger than a 10-minute coding task.
- Stores all requests in Firestore.
- Defers larger work into `future_goals` when automatic Codex execution is not enabled.
- Creates a lightweight implementation job for smaller work.
- In `EVOLVE_AGENT_MODE=codex`, prepares a Codex PR workflow for modifying `line-bot`.
- In `EVOLVE_AGENT_MODE=codex` with `EVOLVE_CODEX_TRIGGER_MODE=github_issue`, creates a GitHub issue that tags `@codex` so Codex cloud can pick up the request, modify the repository, and open a PR.
- Sends an email report to `EVOLVE_REPORT_EMAIL`.

It intentionally does not run Codex inside the Cloud Run request handler. When `EVOLVE_AGENT_MODE=codex`, the preferred path is to hand the request to Codex cloud by creating an `@codex` GitHub issue. If GitHub triggering is not configured, the job keeps a `codexWorkflow` payload for manual or external execution.

The intended automation chain is:

1. `line-bot` calls `POST /requests`.
2. `evolve-engine` stores the request and creates an `evolve_jobs` document.
3. `EVOLVE_AGENT_MODE=codex` writes a `codexWorkflow` containing the target repo, base branch, work branch, PR title, Codex prompt, and post-merge deployment commands.
4. `evolve-engine` creates a GitHub issue in `line-bot` that mentions `@codex` with the implementation prompt.
5. Codex cloud pulls the repository, implements the change, and opens a PR against `line-bot`.
6. After the PR is merged, the worker runs `git pull --ff-only origin <baseBranch>` and deploys the new `line-bot` revision with `gcloud run deploy line-bot --source . --region asia-east1 --allow-unauthenticated`.

## Codex cloud setup

1. Open `https://chatgpt.com/codex` and connect the GitHub account that can access `ShirleyChung/line-bot`.
2. Enable Codex cloud for the `ShirleyChung/line-bot` repository.
3. Ensure GitHub issue comments or issue bodies that mention `@codex` can start Codex tasks for the repo.
4. Provide `EVOLVE_GITHUB_TOKEN` to `evolve-engine`. Use a fine-grained GitHub token scoped to `ShirleyChung/line-bot` with Issues read/write permission. This is an `evolve-engine` runtime secret, not a GitHub Actions repo secret.

## Run

```bash
PORT=8090 \
FIRESTORE_PROJECT_ID=shirleylineagent \
EVOLVE_ENGINE_SHARED_SECRET=local-secret \
EVOLVE_REPORT_EMAIL=joniesg@gmail.com \
EVOLVE_AGENT_MODE=codex \
EVOLVE_REPO_FULL_NAME=ShirleyChung/line-bot \
EVOLVE_REPO_BASE_BRANCH=master \
EVOLVE_CODEX_TRIGGER_MODE=github_issue \
EVOLVE_GITHUB_TOKEN=github_pat_xxx \
npm start
```

The parent repo's `node_modules` can satisfy dependencies during local development. For an independent deployment, run `npm install` inside this directory.

## API

```http
POST /requests
Authorization: Bearer <EVOLVE_ENGINE_SHARED_SECRET>
Content-Type: application/json
```

```json
{
  "userText": "幫我新增查詢某網站資料的工具",
  "reason": "目前沒有可用工具",
  "missingCapability": "查詢某網站資料",
  "expectedBehavior": "使用者問時抓資料並摘要",
  "source": { "type": "user", "userId": "U..." },
  "sessionKey": "user:U..."
}
```

## Firestore Collections

- `evolve_requests`
- `evolve_estimates`
- `evolve_jobs`
- `future_goals`

## Job Statuses

- `pending_manual_review`: automatic execution is disabled.
- `awaiting_codex_pr`: a Codex PR workflow has been prepared and an `@codex` issue has been created, or a manual worker is expected to execute the workflow.
- `codex_trigger_not_configured`: Codex mode is enabled, but `EVOLVE_GITHUB_TOKEN` is missing.
- `codex_trigger_failed`: `evolve-engine` tried to create the GitHub issue but GitHub rejected the request.
- `deferred`: the request is larger than the current automatic threshold and was stored in `future_goals`.
