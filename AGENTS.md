# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

A multi-platform chat bot (LINE primary, plus Telegram, Facebook Messenger, Instagram) deployed as a Cloud Run service. It exposes webhook endpoints, routes inbound messages through built-in handlers first, and falls back to OpenAI Responses API with a large suite of function tools (reminders, stock prices, weather, places/routes, arXiv summaries, OCR, etc.). Firestore is the only persistent store.

## Commands

```bash
# Run locally (Node 20+, ESM). Env vars must be exported first — see `r` (zsh) or `r.bat` (Windows) for the local convention.
npm start
# Deploy to Cloud Run (asia-east1, public).
./run
# Deploy both `line-bot` and `evolve-engine` to Cloud Run.
# Build the Rust SOR log parser used by sorLogService (also built inside the Dockerfile).
cd sorlogparser_rust && cargo build --release --no-default-features
```

There is no test, lint, or build step configured. `package.json` only defines `start`.

The repo uses a git submodule for `sorlogparser_rust`. After clone, run `git submodule update --init` before building the parser binary.

## Architecture

### Request flow

`src/index.js` is the only entry point. It mounts:

- `POST /webhook` — LINE, with `line.middleware()` signature verification.
- `POST /telegram/webhook` — verifies `X-Telegram-Bot-Api-Secret-Token`.
- `GET|POST /facebook/webhook`, `GET|POST /instagram/webhook` — Meta verify + receive.
- `POST /teams/webhook` — Microsoft Teams (Bot Framework), verifies the inbound JWT against `https://login.botframework.com/v1/.well-known/openidconfiguration` using `jose`. Replies require a bearer token fetched via OAuth client_credentials and POSTed back to the activity's `serviceUrl`.
- `GET /cron/check-reminders` — invoked by Cloud Scheduler; pushes due reminders and reschedules/deletes them.
- `GET /sor-log-results/:token` — download endpoint for SOR log query result files.

Each webhook normalizes its inbound payload to a common event shape, then fans out via `routeMessageEvent` in `src/router/commandRouter.js`. The router:

1. Records uploaded image IDs into session state (for later OCR batching).
2. Intercepts uploaded `SorReqOrd*.log` files (`sorLogService.saveSorLogFile`).
3. For text messages, in groups/rooms it only responds when the bot is `@`-mentioned (`isMentionToBot`), and strips the mention before downstream matching.
4. Tries built-in handlers in order: weather → reset-image-ids → today-link → nearby-facility → webpage-summary → SOR log query. Each can short-circuit the LLM.
5. Anything unmatched goes to `handleLlmFallback`.

### LLM + tools

`src/services/llmService.js#askLlmWithTools` is the core LLM loop. It uses the **OpenAI Responses API** (`client.responses.create`) — not Chat Completions — and threads `previous_response_id` through `conversation_state` (Firestore) to maintain session memory. The system prompt is composed at request time from `env.OPENAI_SYSTEM_PROMPT` plus per-user memory (`getUserMemory`) plus the current Asia/Taipei time plus a note about pending uploaded images.

Up to 5 tool-call rounds are allowed. Inside the loop, `executeTool` (in `src/llm/toolDispatcher.js`) dispatches function calls. Tool schemas are declared separately in `src/llm/tools.js`.

**Important shortcut**: for a small set of tools (`get_watch_prices`, `get_stock_price`, `get_latest_arxiv_papers`, `find_nearby_parking`, `find_nearby_facilities`), `llmService` returns the tool's preformatted `text`/`replyText` **directly to the user** without feeding the result back to the model. This is intentional — it avoids the model paraphrasing numeric/structured output. When adding a new tool whose output is already user-ready, follow the same pattern; otherwise return JSON and let the model summarize.

The OPENAI_SYSTEM_PROMPT in `src/config/env.js` is large and contains explicit routing rules (which user phrasings should call which tool, what defaults to use for parameters like `paperCount`, `radiusMeters`, `mode`). When adding or renaming a tool, update both `tools.js` (schema), `toolDispatcher.js` (executor), and the prompt in `env.js` (routing rules) together.

### Platform abstraction

`src/platform/reply.js` provides `replyText(event, text)`. LINE events use the SDK's `replyToken`; Telegram/Meta events have a `replyText` function attached during normalization (`normalizeTelegramUpdate`, `normalizeMetaWebhook`). Handlers should always call the platform-agnostic `replyText`, never the LINE SDK directly.

Owners (used as Firestore document keys for reminders, watchlists, etc.) are derived from `buildSessionKey(source)` in `conversationStateService.js`:

- LINE 1:1: `user:Uxxx`, group: `group:Gxxx`, room: `room:Rxxx`
- Telegram: `telegram:user:telegram:<chatId>`
- Meta: `facebook:user:facebook:<id>`, `instagram:user:instagram:<id>`
- Teams: `teams:user:teams:<conversationId>` — anchored on the Bot Framework `conversation.id` (so 1:1, group chats, and channels each get their own session). The full conversation reference (`serviceUrl`, `bot`/`recipient` IDs, `tenantId`) is persisted in `session_state.teamsConversationRef` on first reply, because proactive pushes (reminders) need it.

`src/index.js#pushReminder` reverses these prefixes to push back to the right platform. Keep that mapping in sync if you add a new platform.

### Persistence

Firestore is accessed via a single client in `src/services/firestore.js`. Collections:

- `conversation_state` — `lastResponseId` per session for OpenAI Responses API continuity.
- `reminders` — scheduled reminders (one-shot or daily). Cron query is `where time <= now AND notified == false`.
- `session_state` — per-session ephemeral state (uploaded image IDs, last SOR log file).
- Plus user-memory and watchlist documents.

There is no migration tooling; collections are created on first write.

### SOR log parser

`sorlogparser_rust/` is a git submodule containing a Rust CLI (`sor_logparser`). The Dockerfile multi-stage build compiles it with `--no-default-features` (the `gui` feature is for desktop only). `sorLogService.js` resolves the binary path via `SOR_LOG_PARSER_PATH` → `bin/sor_logparser` → `sorlogparser_rust/target/release/sor_logparser` (in that order) and shells out with `execFile`. When the user uploads a `SorReqOrd*.log` file, it is cached in `os.tmpdir()/line-bot-sorlogs/<sessionDigest>/` and indexed in Firestore for later queries like `SorRID 000001` or `TwfOrd:OrdNo 12345`.

### Environment variables

All env access goes through `src/config/env.js`. `required()` throws at startup if a key is missing, so adding a new mandatory variable will fail-fast every deployment that hasn't set it — prefer `process.env.X || ""` for optional integrations. `.evn.example` (note the typo in the filename) lists representative values.

## Conventions

- ES modules only (`"type": "module"`). Use `import`/`export`, include `.js` extensions in relative imports.
- All user-facing strings are Traditional Chinese.
- Times: when persisting or comparing, use `Date` objects; when talking to the LLM, render as ISO 8601 with `+08:00`. The system prompt instructs the model to do this.
- Tool execution errors should `throw new Error(...)` with a Chinese message — they bubble up to the model as a tool-call error and influence its retry/explanation.
