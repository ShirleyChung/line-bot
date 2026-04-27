/**
 * 這個 handler 專門處理一般聊天，也就是沒有命中內建工具時的 fallback。
 */

import { askLlm } from "../services/llmService.js";
import { replyText } from "../line/reply.js";

/**
 * 處理一般 LLM 對話
 * @param {object} event - LINE webhook event
 * @param {string} userText - 使用者文字
 */
export async function handleLlmFallback(event, userText) {
  const answer = await askLlm(userText);
  return replyText(event.replyToken, answer);
}
