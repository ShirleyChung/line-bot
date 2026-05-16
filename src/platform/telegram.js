import { env } from "../config/env.js";

/**
 * 驗證 Telegram webhook secret。
 * 如果沒有設定 TELEGRAM_WEBHOOK_SECRET，代表部署環境選擇不啟用這層檢查。
 * @param {object} req - Express request 物件
 * @returns {boolean} 驗證是否通過
 */
export function verifyTelegramSecret(req) {
  if (!env.TELEGRAM_WEBHOOK_SECRET) return true;
  return req.get("X-Telegram-Bot-Api-Secret-Token") === env.TELEGRAM_WEBHOOK_SECRET;
}

/**
 * 將 Telegram update 轉成專案內部共用的 message event 格式。
 * 這樣 router 不需要知道外部平台原始 payload 的差異，
 * 只要處理 type/source/message/replyText 這幾個共通欄位。
 * @param {object} update - Telegram update 物件
 * @returns {Array} 標準化的 event 陣列
 */
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

/**
 * 傳送文字訊息到 Telegram
 * @param {string|number} chatId - Telegram chat ID
 * @param {string} text - 訊息內容
 * @returns {Promise<object>} Telegram API 回應
 */
export async function sendTelegramText(chatId, text) {
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
