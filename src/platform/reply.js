import { replyText as replyLineText } from "../line/reply.js";

/**
 * Reply to the current webhook event, regardless of the platform adapter.
 *
 * LINE events do not carry replyText because they are native SDK events.
 * Other platform adapters attach replyText when they normalize the event.
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
