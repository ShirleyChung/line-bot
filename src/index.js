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
import { line, lineConfig, lineClient } from "./line/client.js";
import { routeMessageEvent } from "./router/commandRouter.js";
import { getSorLogResultFile } from "./services/sorLogService.js";
import { normalizeTelegramUpdate, sendTelegramText, verifyTelegramSecret } from "./platform/telegram.js";
import { normalizeMetaWebhook, sendMetaText, verifyMetaWebhook } from "./platform/meta.js";
import { getDueReminders, deleteReminder, rescheduleReminder } from "./services/reminderService.js";
import { buildReminderMessage, getNextReminderTime } from "./services/reminderContentService.js";

const app = express();
app.set("trust proxy", true);

function getRequestBaseUrl(req) {
  const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host");
  return host ? `${protocol}://${host}` : "";
}

function attachRequestBaseUrl(events, req) {
  const requestBaseUrl = getRequestBaseUrl(req);
  return events.map((event) => ({ ...event, requestBaseUrl }));
}

/**
 * 健康檢查
 * 方便確認服務是否正常啟動
 */
app.get("/", (req, res) => {
  res.status(200).send("ok");
});

app.get("/sor-log-results/:token", async (req, res) => {
  try {
    const result = await getSorLogResultFile(req.params.token);
    if (!result) {
      return res.status(404).send("result not found");
    }

    return res.download(result.filePath, result.fileName);
  } catch (error) {
    console.error("download sor log result error:", error);
    return res.status(500).send("download failed");
  }
});

/**
 * LINE webhook 入口
 * 這裡使用 LINE SDK middleware 驗證簽章。
 * 驗證通過後再把每個 event 丟給共用 router。
 */
app.post("/webhook", line.middleware(lineConfig), async (req, res) => {
  try {
    const events = attachRequestBaseUrl(req.body.events || [], req);

    // 平行處理同一批事件
    await Promise.all(events.map(routeMessageEvent));

    res.status(200).end();
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).end();
  }
});

/**
 * Telegram webhook 入口
 *
 * 目前支援純文字訊息，會轉成內部共用 message event 再交給 router。
 */
app.post("/telegram/webhook", express.json(), async (req, res) => {
  if (!verifyTelegramSecret(req)) {
    return res.status(401).send("invalid telegram secret");
  }

  try {
    const events = attachRequestBaseUrl(normalizeTelegramUpdate(req.body), req);
    await Promise.all(events.map(routeMessageEvent));

    res.status(200).send("ok");
  } catch (error) {
    console.error("Telegram webhook error:", error);
    res.status(500).send("error");
  }
});

/**
 * Facebook Messenger webhook 驗證與訊息入口
 */
app.get("/facebook/webhook", verifyMetaWebhook);

app.post("/facebook/webhook", express.json(), async (req, res) => {
  try {
    const events = attachRequestBaseUrl(normalizeMetaWebhook(req.body, "facebook"), req);
    await Promise.all(events.map(routeMessageEvent));

    res.status(200).send("EVENT_RECEIVED");
  } catch (error) {
    console.error("Facebook webhook error:", error);
    res.status(500).send("error");
  }
});

/**
 * Instagram Messaging webhook 驗證與訊息入口
 */
app.get("/instagram/webhook", verifyMetaWebhook);

app.post("/instagram/webhook", express.json(), async (req, res) => {
  try {
    const events = attachRequestBaseUrl(normalizeMetaWebhook(req.body, "instagram"), req);
    await Promise.all(events.map(routeMessageEvent));

    res.status(200).send("EVENT_RECEIVED");
  } catch (error) {
    console.error("Instagram webhook error:", error);
    res.status(500).send("error");
  }
});

/**
 * 提醒功能
 */
function toLineTargetId(owner) {
  if (!owner) return "";
  return owner.replace(/^user:/, "").replace(/^group:/, "").replace(/^room:/, "");
}

function toTelegramChatId(owner) {
  if (!owner) return "";
  return owner.replace(/^telegram:user:telegram:/, "");
}

function toMetaRecipientId(owner, platform) {
  if (!owner) return "";
  return owner.replace(new RegExp(`^${platform}:user:${platform}:`), "");
}

async function pushReminder(owner, text) {
  if (owner?.startsWith("telegram:user:telegram:")) {
    const chatId = toTelegramChatId(owner);
    if (!chatId) {
      throw new Error(`無法解析 Telegram chat id：${owner}`);
    }

    await sendTelegramText(chatId, text);
    return { platform: "telegram", targetId: chatId };
  }

  for (const platform of ["facebook", "instagram"]) {
    if (owner?.startsWith(`${platform}:user:${platform}:`)) {
      const recipientId = toMetaRecipientId(owner, platform);
      if (!recipientId) {
        throw new Error(`無法解析 ${platform} recipient id：${owner}`);
      }

      await sendMetaText(platform, recipientId, text);
      return { platform, targetId: recipientId };
    }
  }

  const targetId = toLineTargetId(owner);
  if (!targetId) {
    throw new Error(`無法解析 LINE target id：${owner}`);
  }

  await lineClient.pushMessage({
    to: targetId,
    messages: [
      {
        type: "text",
        text,
      },
    ],
  });

  return { platform: "line", targetId };
}

app.get("/cron/check-reminders", async (req, res) => {
  try {
    const now = new Date();
    console.log("[cron] now =", now.toISOString());

    const reminders = await getDueReminders(now);
    console.log("[cron] reminders =", reminders);

    for (const r of reminders) {
      if (!r.owner) {
        console.log("[cron] skip empty owner:", r);
        continue;
      }

      console.log("[cron] pushing reminder:", {
        id: r.id,
        owner: r.owner,
        target: r.target,
        action: r.action,
        time: r.time?.toDate ? r.time.toDate().toISOString() : r.time,
      });

      try {
        let text;
        try {
          text = await buildReminderMessage(r);
        } catch (err) {
          console.error("[cron] build reminder message failed:", r.id, err);
          text = `提醒執行失敗：${r.action || "提醒"}\n請稍後再試或重新設定提醒。`;
        }

        const pushResult = await pushReminder(r.owner, text);
        console.log("[cron] reminder pushed:", {
          id: r.id,
          platform: pushResult.platform,
          targetId: pushResult.targetId,
        });

        const nextTime = getNextReminderTime(r, now);
        if (nextTime) {
          await rescheduleReminder(r.id, nextTime);
          console.log("[cron] rescheduled reminder:", r.id, nextTime.toISOString());
        } else {
          await deleteReminder(r.id);
          console.log("[cron] deleted reminder:", r.id);
        }
      } catch (err) {
        console.error("[cron] reminder failed:", r.id, err);
      }
    }

    res.send("ok");
  } catch (err) {
    console.error("[cron] error:", err);
    res.status(500).send("error");
  }
});

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});
