# evolve-engine

`evolve-engine` is a separate service for receiving line-bot capability requests that current tools cannot satisfy.

First-phase behavior:

- Accepts requests from `line-bot`.
- Estimates whether implementation looks larger than a 10-minute coding task.
- Stores all requests in Firestore.
- Defers larger work into `future_goals`.
- Creates a lightweight implementation job for smaller work.
- Sends an email report to `EVOLVE_REPORT_EMAIL`.

It intentionally does not auto-edit, auto-test, or auto-deploy production code yet when `EVOLVE_AGENT_MODE=manual`. Those steps are exposed as `agent` and future `deploy` adapters so they can be enabled behind review/branch gates.

## Run

```bash
PORT=8090 \
FIRESTORE_PROJECT_ID=shirleylineagent \
EVOLVE_ENGINE_SHARED_SECRET=local-secret \
EVOLVE_REPORT_EMAIL=joniesg@gmail.com \
EVOLVE_AGENT_MODE=manual \
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
