import { env } from "../config/env.js";

export function verifyTelegramSecret(req) {
  if (!env.TELEGRAM_WEBHOOK_SECRET) return true;
  return req.get("X-Telegram-Bot-Api-Secret-Token") === env.TELEGRAM_WEBHOOK_SECRET;
}

export function normalizeTelegramUpdate(update) {
  const message = update.message || update.edited_message;
  if (!message) return [];

  const chatId = message.chat?.id;
  const text = message.text;
  const messageId = message.message_id;
  const userId = message.from?.id || chatId;

  if (!chatId) return [];

  return [
    {
      platform: "telegram",
      type: "message",
      replyToken: `telegram:${chatId}:${messageId || update.update_id}`,
      source: {
        platform: "telegram",
        type: "user",
        userId: `telegram:${chatId}`,
        chatId: String(chatId),
        actorId: userId ? `telegram:${userId}` : "",
        rawUserId: userId ? String(userId) : "",
        rawChatId: String(chatId),
      },
      message: {
        id: messageId ? String(messageId) : String(update.update_id),
        type: typeof text === "string" ? "text" : "unknown",
        text: typeof text === "string" ? text : "",
      },
      rawEvent: update,
      replyText: (replyText) => sendTelegramText(chatId, replyText),
    },
  ];
}

async function sendTelegramText(chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("缺少 TELEGRAM_BOT_TOKEN，無法回覆 Telegram 訊息");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`);
  }

  return response.json();
}
