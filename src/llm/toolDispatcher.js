/**
 * 這裡負責把模型要求的 tool call，
 * 真正對應到你已經寫好的功能。
 */

import { getTodayLinkFromSheet } from "../services/sheetLinkService.js";
import { replyText } from "../line/reply.js";
import { lineClient } from "../line/client.js";

/**
 * 可選：限制 push 只能送到白名單目標
 * 你可以在 Cloud Run 環境變數裡設：
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
 * 組裝今天連結的訊息內容
 */
function buildTodayLinkMessage(url, includeZoomInfo = true) {
  let text = `今天的連結如下：\n${url}`;

  if (includeZoomInfo) {
    text +=
      `\n\n線上聯結：https://us06web.zoom.us/j/87317139779?pwd=0oJsbadeBpeCOc2RUYQscgLjbTIbcd.1` +
      `\n會議ID：873 1713 9779` +
      `\n密碼：707070`;
  }

  return text;
}

/**
 * 執行模型要求的工具
 *
 * @param {string} name - 工具名稱
 * @param {object} args - 工具參數
 * @param {object} context - 執行上下文，例如 replyToken / source / userId
 * @returns {Promise<object>}
 */
export async function executeTool(name, args = {}, context = {}) {
  switch (name) {
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
        throw new Error("reply_today_link 缺少 replyToken，無法在當前 webhook 對話中回覆");
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
        throw new Error("push_today_link 缺少 targetId");
      }

      // 建議保留白名單，避免 LLM 對任意 targetId 推送
      const allowedTargets = getAllowedPushTargets();
      if (allowedTargets.size > 0 && !allowedTargets.has(targetId)) {
        throw new Error(`不允許推送到這個 targetId：${targetId}`);
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
      throw new Error(`未知工具：${name}`);
  }
}