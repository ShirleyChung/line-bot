import { replyText as replyLineText } from "../line/reply.js";

/**
 * 統一回覆目前 webhook event，不讓上層 handler 綁死在單一平台。
 *
 * LINE event 是 SDK 原生格式，所以沒有 replyText adapter；
 * Telegram / Meta 會在 normalize 時掛上 replyText，讓 router 與 handler 可以共用同一套流程。
 */
export async function replyText(event, text) {
  if (typeof event?.replyText === "function") {
    return event.replyText(text);
  }

  if (!event?.replyToken) {
    throw new Error("replyText 缺少 replyToken 或平台 replyText adapter");
  }

  return replyLineText(event.replyToken, text);
}
