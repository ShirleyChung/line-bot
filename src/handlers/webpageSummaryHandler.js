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
  if (!containsHttpUrl(text)) return false;

  // 單純分享網址不自動花費 LLM token；只有明確要求摘要或整理內容才處理。
  return /(摘要|總結|整理(?:一下|這篇|內容|重點)?|重點|懶人包|概述|簡述|歸納|幫我看|內容是什麼|在說什麼|說了什麼)/i.test(text);
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
