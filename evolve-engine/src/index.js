import express from "express";
import { env } from "./config/env.js";
import { requestsRouter } from "./api/requests.js";

const app = express();

// evolveEngine 只接收小型 JSON 需求單，避免意外傳入過大的 payload 佔用資源。
app.use(express.json({ limit: "1mb" }));

// Cloud Run / uptime check 可用這個端點確認服務已啟動。
app.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "evolve-engine",
  });
});

app.use(requestsRouter);

app.listen(env.PORT, () => {
  console.log(`[evolve-engine] listening on ${env.PORT}`);
});
