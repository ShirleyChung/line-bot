/**
 * 這是整個 Cloud Run 服務的入口檔。
 * 它只負責：
 * 1. 啟動 Express
 * 2. 建立 webhook 路由
 * 3. 把 event 丟給 router
 *
 * 真正的業務邏輯全部分散到其他模組，
 * 這樣 index.js 會非常乾淨，也比較容易維護。
 */

import express from "express";
import { env } from "./config/env.js";
import { line, lineConfig } from "./line/client.js";
import { routeMessageEvent } from "./router/commandRouter.js";

const app = express();

/**
 * 健康檢查
 * 方便確認服務是否正常啟動
 */
app.get("/", (req, res) => {
  res.status(200).send("ok");
});

/**
 * LINE webhook 入口
 * 這裡使用 LINE SDK middleware 驗證簽章。
 * LINE webhook / reply 的處理方式就是這種模式。:contentReference[oaicite:5]{index=5}
 */
app.post("/webhook", line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events || [];

    // 平行處理同一批事件
    await Promise.all(events.map(routeMessageEvent));

    res.status(200).end();
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).end();
  }
});

// 啟動 HTTP 服務
app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});
