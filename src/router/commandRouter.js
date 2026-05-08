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
import { replyText } from "../platform/reply.js";
import {
  isTodayLinkCommand,
  isResetImageIdsCommand,
  isMentionToBot,
  stripMentionsFromText,
} from "../utils/textUtils.js";
import { buildSessionKey } from "../services/conversationStateService.js";
import {
  addImageId,
  clearImageIds,
  getImageIds,
} from "../services/sessionStateService.js";
import { handleWeatherMessage } from "../handlers/weatherHandler.js";

/**
 * 路由 webhook event
 *
 * @param {object} event - LINE webhook event
 */
export async function routeMessageEvent(event) {
  const sessionKey = buildSessionKey(event.source);

  // 收到圖片時，先把這張圖片加入當日批次記錄
  if (event.type === "message" && event.message?.type === "image") {
    await addImageId(sessionKey, event.message.id);
  }
  // 只處理文字訊息
  if (event.type !== "message" || event.message?.type !== "text") {
    return null;
  }
  // 先嘗試天氣訊息處理，如果有命中就直接回覆，不進 LLM
  const handledByWeather = await handleWeatherMessage(event);
  if (handledByWeather) return;


  // 原始文字（保留完整內容）
  const rawText = (event.message.text || "").trim();
  // 去掉 mention 後的文字（拿來做命令判斷）
  const userText = stripMentionsFromText(event);

  const imageIds = await getImageIds(sessionKey);
  const latestImageId = imageIds.at(-1) || null;
  const context = {
    replyToken: event.replyToken,
    source: event.source,
    sessionKey,
    imageIds,
    latestImageId,
  };

  const sourceType = event.source?.type;

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

    if (isResetImageIdsCommand(userText)) {
      await clearImageIds(sessionKey);
      return await replyText(event, "已重置圖片記錄。");
    }

    // 先攔截內建命令（使用移除 mention 後的文字）
    if (isTodayLinkCommand(userText) && !/(提醒|排程|每天|每日|固定)/.test(userText)) {
      return await handleTodayLink(event);
    }

    // 沒命中才進 LLM
    // 這裡優先丟去掉 mention 後的文字，避免把 @bot 名稱一起送進 LLM
    return await handleLlmFallback(event, userText || rawText, context);
  } catch (error) {
    console.error("routeMessageEvent error:", error);
    return replyText(event, "處理失敗，請稍後再試。");
  }
}
