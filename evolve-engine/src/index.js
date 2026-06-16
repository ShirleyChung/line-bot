import express from "express";
import { env } from "./config/env.js";
import { requestsRouter } from "./api/requests.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

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
