/**
 * 這個 handler 專門處理「今天連結」類型的命令。
 * 它只負責協調：
 * 1. 叫 service 查今天連結
 * 2. 組裝要回給 LINE 的訊息
 * 3. 呼叫 replyText
 */

import { get_today_link } from "../services/sheetLinkService.js";
import { replyText, pushText } from "../line/reply.js";

/**
 * 處理今天連結命令
 * @param {object} event - LINE webhook event
 */
export async function handleTodayLink(event) {
  const message = await get_today_link();
  return replyText(event.replyToken, message);
}

/**
 * 在目前 webhook 對話裡直接 reply 今天連結
 * @param {string} replyToken - LINE webhook event 內的 replyToken
 */
export async function reply_today_link(replyToken) {
  const message = await get_today_link();
  return replyText(replyToken, message);
}

/**
 * 主動發通知給指定 userId 或 groupId
 * @param {string} target - userId 或 groupId
 */
export async function push_today_link(target) {
  const message = await get_today_link();
  return pushText(target, message);
}
