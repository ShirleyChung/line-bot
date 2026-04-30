/**
 * 這個 router 是整個 bot 的核心分流器。
 * 原則是：
 * 1. 只處理文字訊息
 * 2. 在群組 / 多人聊天室中，只有 bot 被 @ 提及時才回覆
 * 3. 先把 @提及文字從訊息中移除，避免影響內建命令判斷
 * 4. 先判斷是否命中內建功能
 * 5. 沒命中才交給 LLM fallback
 */

import { handleTodayLink } from "../handlers/todayLinkHandler.js";
import { handleLlmFallback } from "../handlers/llmHandler.js";
import { replyText } from "../line/reply.js";
import {
  isTodayLinkCommand,
  isMentionToBot,
  stripMentionsFromText,
} from "../utils/textUtils.js";

/**
 * 路由 webhook event
 *
 * @param {object} event - LINE webhook event
 */
export async function routeMessageEvent(event) {
  // 只處理文字訊息
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const sourceType = event.source?.type;

  // 原始文字（保留完整內容）
  const rawText = (event.message.text || "").trim();

  // 去掉 mention 後的文字（拿來做命令判斷）
  const userText = stripMentionsFromText(event);

  try {
    /**
     * 群組 / 多人聊天室中：
     * 只有 bot 被 @ 提及時才回覆
     *
     * source.type 可能是：
     * - user  : 一對一聊天
     * - group : 群組
     * - room  : 多人聊天室
     */
    if ((sourceType === "group" || sourceType === "room") && !isMentionToBot(event)) {
      return null;
    }

    // 先攔截內建命令（使用移除 mention 後的文字）
    if (isTodayLinkCommand(userText)) {
      return await handleTodayLink(event);
    }

    // 沒命中才進 LLM
    // 這裡優先丟去掉 mention 後的文字，避免把 @bot 名稱一起送進 LLM
    return await handleLlmFallback(event, userText || rawText);
  } catch (error) {
    console.error("routeMessageEvent error:", error);
    return replyText(event.replyToken, "處理失敗，請稍後再試。");
  }
}
