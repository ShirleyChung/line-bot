# Copilot Instructions for `line-bot`

## Build and run

- `npm start` — run the service locally (`node src/index.js`).
- `./run` — deploy to Cloud Run.
- `cd sorlogparser_rust && cargo build --release --no-default-features` — build the Rust SOR log parser used by `sorLogService`.

There is no configured test or lint script in `package.json`.

## Architecture

- `src/index.js` is the HTTP entry point. It mounts LINE, Telegram, Facebook, Instagram, reminder cron, and SOR log download endpoints.
- Webhook payloads are normalized into a shared event shape, then routed through `src/router/commandRouter.js`.
- The router handles built-in flows first: image batching, uploaded `SorReqOrd*.log` files, mention handling in groups/rooms, weather, reset-image-ids, today-link, nearby facility/parking, webpage summary, and SOR log queries. Anything else falls back to the LLM.
- `src/services/llmService.js` uses the OpenAI Responses API with `previous_response_id` stored in Firestore so conversations continue across turns.
- Tool definitions live in `src/llm/tools.js`, execution lives in `src/llm/toolDispatcher.js`, and routing rules also need to stay aligned with `src/config/env.js`.
- Some tools return user-ready text directly (`get_watch_prices`, `get_stock_price`, `get_latest_arxiv_papers`, `find_nearby_parking`, `find_nearby_facilities`) instead of feeding output back to the model.
- Firestore is the only persistent store. It holds conversation state, reminders, session state, user memory, and watchlists.
- Platform-specific reply helpers are abstracted behind `src/platform/reply.js`; handlers should use `replyText(...)` rather than platform SDKs directly.

## Key conventions

- ES modules only. Use `import`/`export` and include `.js` extensions in relative imports.
- All user-facing strings are Traditional Chinese.
- Time handling: store and compare with `Date` objects; when asking the LLM to reason about time, render timestamps in ISO 8601 with `+08:00`.
- Tool execution errors should `throw new Error(...)` with a Chinese message so the model can surface them correctly.
- Keep owner/session key formats in sync with `conversationStateService.js` and the push logic in `src/index.js`.
- The Rust parser is a git submodule; run `git submodule update --init` after cloning before building it.
- Adding or renaming a tool usually requires coordinated changes in three places: `src/llm/tools.js`, `src/llm/toolDispatcher.js`, and `src/config/env.js`.
- Environment validation is centralized in `src/config/env.js`; required variables fail fast at startup.
