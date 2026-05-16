import { replyText } from "../platform/reply.js";
import {
  containsHttpUrl,
  summarizeUrlsFromText,
} from "../services/webpageSummaryService.js";

/**
 * 判斷是否應處理網頁摘要請求
 * @param {string} text - 使用者訊息
 * @returns {boolean} 是否包含 HTTP URL
 */
export function shouldHandleWebpageSummary(text = "") {
  return containsHttpUrl(text);
}

/**
 * 處理網頁摘要請求
 * @param {object} event - webhook event
 * @param {string} userText - 使用者訊息
 * @returns {Promise<boolean>} 是否處理成功
 */
export async function handleWebpageSummary(event, userText) {
  const message = await summarizeUrlsFromText(userText);
  if (!message) return false;

  await replyText(event, message);
  return true;
}
