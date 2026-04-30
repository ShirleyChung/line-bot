
/**
 * 本檔案負責處理來自 LLM 的 tool call，
 * 並根據需求執行對應工具。
 */

import { createReminder } from "../services/reminderService.js";
import { buildSessionKey } from "../services/conversationStateService.js";
import { getTodayLinkFromSheet } from "../services/sheetLinkService.js";
import { getTodayEvents, createCalendarEvent } from "../services/calendarService.js";
import { replyText } from "../line/reply.js";
import { lineClient } from "../line/client.js";

/**
 * 可設定允許 push 的目標 id 清單
 * 可於 Cloud Run 設定環境變數：
 * ALLOWED_PUSH_TARGETS=id1,id2,id3
 */
function getAllowedPushTargets() {
  const raw = process.env.ALLOWED_PUSH_TARGETS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/**
 * 組合今日連結訊息內容
 */
function buildTodayLinkMessage(url, includeZoomInfo = true) {
  let text = `今日的上課連結如下：\n${url}`;

  if (includeZoomInfo) {
    text +=
      `\n\nZoom 會議連結：https://us06web.zoom.us/j/87317139779?pwd=0oJsbadeBpeCOc2RUYQscgLjbTIbcd.1` +
      `\n會議ID：873 1713 9779` +
      `\n密碼：707070`;
  }

  return text;
}

/**
 * 執行指定的工具
 *
 * @param {string} name - 工具名稱
 * @param {object} args - 工具參數
 * @param {object} context - 執行上下文，例如 replyToken / source / userId
 * @returns {Promise<object>}
 */
export async function executeTool(name, args = {}, context = {}) {
  switch (name) {
    case "create_reminder": {
      if (!args.target || !args.action || !args.time) {
        throw new Error("create_reminder 缺少必要參數");
      }
      if (Number.isNaN(Date.parse(args.time))) {
        throw new Error(`create_reminder 時間格式錯誤：${args.time}`);
      }
      const owner = buildSessionKey(context.source);
      const reminderId = await createReminder({
        owner,
        target: args.target,
        action: args.action,
        time: args.time,
      });
      return {
        ok: true,
        tool: name,
        reminderId,
        owner,
        target: args.target,
        action: args.action,
        time: args.time,
      };
    }

    case "get_today_link": {
      const url = await getTodayLinkFromSheet();

      return {
        ok: true,
        tool: name,
        url,
      };
    }

    case "reply_today_link": {
      if (!context.replyToken) {
        throw new Error("reply_today_link 需要 replyToken，無法直接於 webhook 之外回覆");
      }

      const url = await getTodayLinkFromSheet();
      const message = buildTodayLinkMessage(url, args.includeZoomInfo ?? true);

      await replyText(context.replyToken, message);

      return {
        ok: true,
        tool: name,
        replied: true,
        url,
      };
    }

    case "push_today_link": {
      const targetId = args.targetId?.trim();
      if (!targetId) {
        throw new Error("push_today_link 需要 targetId");
      }

      // 若有限制目標 id，則檢查 targetId 是否允許
      const allowedTargets = getAllowedPushTargets();
      if (allowedTargets.size > 0 && !allowedTargets.has(targetId)) {
        throw new Error(`不允許推播到此 targetId：${targetId}`);
      }

      const url = await getTodayLinkFromSheet();
      const message = buildTodayLinkMessage(url, args.includeZoomInfo ?? true);

      await lineClient.pushMessage({
        to: targetId,
        messages: [
          {
            type: "text",
            text: message,
          },
        ],
      });

      return {
        ok: true,
        tool: name,
        pushed: true,
        url,
        targetId,
      };
    }

    default:
      throw new Error(`未知的工具名稱：${name}`);
  }
}