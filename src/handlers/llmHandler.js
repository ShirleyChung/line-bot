/**
 * 這個 handler 專門處理一般 LLM 對話。
 * 現在升級成：LLM 可以依需要呼叫 tools / skills。
 */

import { askLlmWithTools } from "../services/llmService.js";
import { replyText } from "../platform/reply.js";

/**
 * 處理一般 LLM 對話
 *
 * @param {object} event - LINE webhook event
 * @param {string} userText - 使用者文字
 */
export async function handleLlmFallback(event, userText, context = {}) {
  const result = await askLlmWithTools(userText, {
    event,
    replyToken: event.replyToken,
    source: event.source,
    ...context,
  });
  if (result.type === "text" && result.text) {
    return replyText(event, result.text);
  }

  return null;
}
