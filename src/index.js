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
import { normalizeTeamsActivity, pushTeamsReminder, verifyTeamsRequest } from "./platform/teams.js";
import { getDueReminders, deleteReminder, rescheduleReminder } from "./services/reminderService.js";
import { buildReminderMessage, getNextReminderTime } from "./services/reminderContentService.js";
import { sendEmail } from "./services/emailService.js";
import { normalizeEmailRecipients } from "./utils/emailRecipients.js";
import {
  buildWorldCupBroadcastText,
  listActiveTelegramBroadcasts,
  markBroadcastPushed,
  shouldPushWorldCupBroadcast,
} from "./services/worldCupBroadcastService.js";

const app = express();
app.set("trust proxy", true);

/**
 * 取得請求的基礎 URL
 * @param {object} req - Express request 物件
 * @returns {string} 基礎 URL，例如 https://example.com
 */
function getRequestBaseUrl(req) {
  const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host");
  return host ? `${protocol}://${host}` : "";
}

/**
 * 為每個 event 附加請求基礎 URL
 * @param {Array} events - webhook events 陣列
 * @param {object} req - Express request 物件
 * @returns {Array} 附加了 requestBaseUrl 的 events
 */
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
 * Microsoft Teams (Bot Framework / Azure Bot) webhook 入口
 *
 * Bot Framework 會在 Authorization header 帶 JWT，由 verifyTeamsRequest
 * 驗章；通過後將 activity 正規化交給共用 router。
 */
app.post("/teams/webhook", express.json(), async (req, res) => {
  const authorized = await verifyTeamsRequest(req);
  if (!authorized) {
    return res.status(401).send("invalid teams auth");
  }

  try {
    const events = attachRequestBaseUrl(normalizeTeamsActivity(req.body), req);
    await Promise.all(events.map(routeMessageEvent));

    res.status(200).end();
  } catch (error) {
    console.error("Teams webhook error:", error);
    res.status(500).end();
  }
});

/**
 * 提醒功能
 */
/**
 * 將 owner 字串轉換為 LINE target ID
 * @param {string} owner - owner 字串，例如 user:Uxxxx
 * @returns {string} LINE target ID
 */
function toLineTargetId(owner) {
  if (!owner) return "";
  return owner.replace(/^user:/, "").replace(/^group:/, "").replace(/^room:/, "");
}

/**
 * 將 owner 字串轉換為 Telegram chat ID
 * @param {string} owner - owner 字串，例如 telegram:user:telegram:123456
 * @returns {string} Telegram chat ID
 */
function toTelegramChatId(owner) {
  if (!owner) return "";
  return owner.replace(/^telegram:user:telegram:/, "");
}

/**
 * 將 owner 字串轉換為 Meta 平台（Facebook/Instagram）的 recipient ID
 * @param {string} owner - owner 字串
 * @param {string} platform - 平台名稱，facebook 或 instagram
 * @returns {string} Meta recipient ID
 */
function toMetaRecipientId(owner, platform) {
  if (!owner) return "";
  return owner.replace(new RegExp(`^${platform}:user:${platform}:`), "");
}

/**
 * 根據 owner 推送提醒訊息到對應平台；若 reminder 的 payload 帶有 emailRecipient，改寄 email。
 * @param {string} owner - owner 字串，包含平台與 ID 資訊
 * @param {string} text - 要推送的訊息內容
 * @param {object} [options] - 額外選項
 * @param {string} [options.emailRecipient] - 若設定則以 email 取代聊天推送
 * @param {string} [options.subject] - email 主旨
 * @returns {Promise<object>} 推送結果，包含 platform 和 targetId
 */
async function pushReminder(owner, text, options = {}) {
  const { subject } = options;
  const emailRecipient = normalizeEmailRecipients(options.emailRecipient);

  if (emailRecipient) {
    await sendEmail({
      to: emailRecipient,
      subject: subject || "排程提醒",
      body: text,
    });
    return { platform: "email", targetId: emailRecipient };
  }
  if (owner?.startsWith("telegram:user:telegram:")) {
    const chatId = toTelegramChatId(owner);
    if (!chatId) {
      throw new Error(`無法解析 Telegram chat id：${owner}`);
    }

    await sendTelegramText(chatId, text);
    return { platform: "telegram", targetId: chatId };
  }

  if (owner?.startsWith("teams:user:teams:")) {
    const conversationId = await pushTeamsReminder(owner, text);
    return { platform: "teams", targetId: conversationId };
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

async function pushWorldCupBroadcasts() {
  const subscriptions = await listActiveTelegramBroadcasts();
  if (!subscriptions.length) {
    return { pushed: 0, subscriptions: 0 };
  }

  const broadcast = await buildWorldCupBroadcastText();
  const now = new Date();
  let pushed = 0;

  for (const subscription of subscriptions) {
    if (!shouldPushWorldCupBroadcast(subscription, broadcast.digest, now)) {
      continue;
    }

    try {
      await sendTelegramText(subscription.telegramChatId, broadcast.text);
      await markBroadcastPushed(subscription.id, broadcast.digest);
      pushed++;
    } catch (error) {
      console.error("[cron] worldcup broadcast push failed:", subscription.id, error);
    }
  }

  return { pushed, subscriptions: subscriptions.length };
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

        const pushResult = await pushReminder(r.owner, text, {
          emailRecipient: r.payload?.emailRecipient,
          subject: r.action,
        });
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

    try {
      const worldCupResult = await pushWorldCupBroadcasts();
      console.log("[cron] worldcup broadcasts:", worldCupResult);
    } catch (err) {
      console.error("[cron] worldcup broadcast failed:", err);
    }

    res.send("ok");
  } catch (err) {
    console.error("[cron] error:", err);
    res.status(500).send("error");
  }
});

app.get("/cron/check-worldcup-broadcasts", async (req, res) => {
  try {
    const result = await pushWorldCupBroadcasts();
    res.send(`ok pushed=${result.pushed} subscriptions=${result.subscriptions}`);
  } catch (error) {
    console.error("[cron] worldcup broadcast error:", error);
    res.status(500).send("error");
  }
});

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});
