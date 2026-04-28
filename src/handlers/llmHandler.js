/**
 * 這個 handler 專門處理一般 LLM 對話。
 * 現在升級成：LLM 可以依需要呼叫 tools / skills。
 */

import { askLlmWithTools } from "../services/llmService.js";
import { replyText } from "../line/reply.js";

/**
 * 處理一般 LLM 對話
 *
 * @param {object} event - LINE webhook event
 * @param {string} userText - 使用者文字
 */
export async function handleLlmFallback(event, userText) {
  const result = await askLlmWithTools(userText, {
    replyToken: event.replyToken,
    source: event.source,
  });

  /**
   * 如果工具本身已經執行 reply_today_link，
   * 這時候模型可能還會再產生一段文字。
   *
   * 為避免同一個 replyToken 被重複 reply，
   * 這裡採取保守做法：
   * - 如果模型有純文字回覆，就只在工具未直接 reply 的情況下回
   * - 若工具已直接 reply，則返回 null
   *
   * 目前用一個簡單規則：
   * 若結果是文字，就回覆；
   * 若未來你想更精細區分，可在 executeTool 裡加旗標。
   */
  if (result.type === "text" && result.text) {
    return replyText(event.replyToken, result.text);
  }

  return null;
}