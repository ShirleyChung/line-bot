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

/**
 * 判斷是不是「今天連結」類命令
 * 這裡會先把空白去掉，再做比對。
 *
 * @param {string} text
 * @returns {boolean}
 */
function isTodayLinkCommand(text) {
  const normalized = text.replace(/\s+/g, "").toLowerCase();

  return (
    normalized === "今天連結" ||
    normalized === "今日連結" ||
    normalized === "todaylink" ||
    normalized === "link" ||
    normalized === "今天聚會連結" ||
    normalized === "今天zoom連結" ||
    normalized.includes("今天連結") ||
    normalized.includes("今天聚會連結") ||
    normalized.includes("今天zoom連結")
  );
}

/**
 * 判斷這則訊息是否有 @ 到 bot 自己
 *
 * LINE 在群組 / room 的文字訊息中，如果有提及 bot，
 * event.message.mention.mentionees 內會有對應資料，
 * 而 bot 自己通常會標示 isSelf = true。
 *
 * @param {object} event
 * @returns {boolean}
 */
function isMentionToBot(event) {
  if (event.type !== "message") return false;
  if (event.message?.type !== "text") return false;

  const mentionees = event.message?.mention?.mentionees || [];

  return mentionees.some((m) => m.type === "user" && m.isSelf === true);
}

/**
 * 把訊息中的 @提及文字移除，避免影響命令判斷
 *
 * LINE mentionee 會提供 index / length，
 * 所以可以直接依據位置把 mention 片段切掉。
 *
 * 例如：
 * 原文：@ShirleyBot 今天連結
 * 移除後：今天連結
 *
 * @param {object} event
 * @returns {string}
 */
function stripMentionsFromText(event) {
  const text = event.message?.text || "";
  const mentionees = event.message?.mention?.mentionees || [];

  if (!mentionees.length) {
    return text.trim();
  }

  // 先依 index 排序，避免切割順序錯亂
  const sorted = [...mentionees].sort((a, b) => a.index - b.index);

  let result = "";
  let cursor = 0;

  for (const mention of sorted) {
    const start = mention.index;
    const end = mention.index + mention.length;

    // 保留 mention 前面的文字
    result += text.slice(cursor, start);

    // 跳過 mention 本身
    cursor = end;
  }

  // 補上最後剩餘的文字
  result += text.slice(cursor);

  // 收尾時把多餘空白壓掉
  return result.replace(/\s+/g, " ").trim();
}

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
