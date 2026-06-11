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
import { handleTodayBibleVerse } from "../handlers/bibleVerseHandler.js";
import { handleLlmFallback } from "../handlers/llmHandler.js";
import {
  handleWebpageSummary,
  shouldHandleWebpageSummary,
} from "../handlers/webpageSummaryHandler.js";
import { replyText } from "../platform/reply.js";
import {
  isTodayLinkCommand,
  isTodayBibleVerseCommand,
  isResetImageIdsCommand,
  isMentionToBot,
  stripMentionsFromText,
} from "../utils/textUtils.js";
import { parseEmailCommand } from "../utils/emailCommand.js";
import { buildSessionKey } from "../services/conversationStateService.js";
import {
  addImageId,
  clearImageIds,
  getImageIds,
} from "../services/sessionStateService.js";
import { handleWeatherMessage } from "../handlers/weatherHandler.js";
import { handleNearbyFacilityMessage } from "../handlers/parkingHandler.js";
import {
  isSorLogFileEvent,
  parseSorLogQuery,
  runSorLogQuery,
  saveSorLogFile,
} from "../services/sorLogService.js";

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
  // 收到 LINE 檔案時，如果是使用者上傳的 SorReqOrd.log，先保存供後續查詢使用。
  if (isSorLogFileEvent(event)) {
    try {
      const savedLog = await saveSorLogFile(event, sessionKey);
      if (!savedLog) return null;

      return await replyText(
        event,
        `已收到 ${savedLog.fileName}。\n可以輸入查詢條件，例如：SorRID 000001 或 TwfOrd:OrdNo 12345。`
      );
    } catch (error) {
      console.error("saveSorLogFile error:", error);
      return await replyText(event, `儲存 SorReqOrd.log 失敗：${error.message}`);
    }
  }
  // 只處理文字訊息
  if (event.type !== "message" || event.message?.type !== "text") {
    return null;
  }

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
     *
     * 這個檢查必須放在所有文字訊息處理（含天氣、命令、LLM）之前，
     * 否則群組中只要有人說「天氣」就會被觸發。
     * 圖片與檔案接收已經在前面處理過，不受此限制。
     */
    if ((sourceType === "group" || sourceType === "room") && !isMentionToBot(event)) {
      return null;
    }

    const emailCommand = parseEmailCommand(userText || rawText);
    if (emailCommand) {
      if (!emailCommand.requestText) {
        return await replyText(event, `請在 email 後面補上要寄送的內容，例如：寄給 ${emailCommand.to} 今天天氣`);
      }

      return await handleLlmFallback(event, emailCommand.rewrittenPrompt, {
        ...context,
        emailRecipient: emailCommand.to,
        emailSubject: emailCommand.requestText || "Email 通知",
        originalUserText: userText || rawText,
      });
    }

    // 先嘗試天氣訊息處理，如果有命中就直接回覆，不進 LLM
    const handledByWeather = await handleWeatherMessage(event);
    if (handledByWeather) return;

    if (isResetImageIdsCommand(userText)) {
      await clearImageIds(sessionKey);
      return await replyText(event, "已重置圖片記錄。");
    }

    // 先攔截內建命令（使用移除 mention 後的文字）
    if (isTodayLinkCommand(userText) && !/(提醒|排程|每天|每日|固定)/.test(userText)) {
      return await handleTodayLink(event);
    }

    if (isTodayBibleVerseCommand(userText) && !/(提醒|排程|每天|每日|固定)/.test(userText)) {
      return await handleTodayBibleVerse(event);
    }

    const handledByNearbyFacility = await handleNearbyFacilityMessage(event, userText || rawText);
    if (handledByNearbyFacility) return;

    if (shouldHandleWebpageSummary(userText)) {
      return await handleWebpageSummary(event, userText);
    }

    const sorLogQuery = parseSorLogQuery(userText);
    if (sorLogQuery) {
      const text = await runSorLogQuery(sessionKey, sorLogQuery, {
        baseUrl: event.requestBaseUrl,
      });
      return await replyText(event, text);
    }

    // 沒命中才進 LLM
    // 這裡優先丟去掉 mention 後的文字，避免把 @bot 名稱一起送進 LLM
    return await handleLlmFallback(event, userText || rawText, context);
  } catch (error) {
    console.error("routeMessageEvent error:", error);
    return replyText(event, "處理失敗，請稍後再試。");
  }
}
