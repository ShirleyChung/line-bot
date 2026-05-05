
/**
 * 本檔案負責處理來自 LLM 的 tool call，
 * 並根據需求執行對應工具。
 */

import { createReminder } from "../services/reminderService.js";
import { buildSessionKey } from "../services/conversationStateService.js";
import { getTodayLinkFromSheet } from "../services/sheetLinkService.js";
import { replyText } from "../line/reply.js";
import { lineClient } from "../line/client.js";
// src/llm/toolDispatcher.js

import { fetchImageBuffer } from "../services/imageService.js";
import { ocrImage } from "../services/ocrService.js";
import { parseOCRToJSON } from "../services/dataParserService.js";
import { jsonToCSV } from "../services/csvService.js";
import {
  addWatchStock,
  removeWatchStock,
  listWatchStocks,
  getWatchPrices,
} from "../services/stockSelectService.js";

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
  let text = `今日的共追連結如下：\n${url}`;

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
    case "extract_image_data": {
      const imageId = args.imageId || context.latestImageId;
      if (!imageId) {
        throw new Error("沒有可用的圖片");
      }
      const buffer = await fetchImageBuffer(imageId);
      const text = await ocrImage(buffer);
      const json = await parseOCRToJSON(text);
      return {
        ok: true,
        data: json,
      };
    }

    case "json_to_csv": {
      const { data, fields } = args;
      const csv = jsonToCSV(data, fields);
      return {
        ok: true,
        csv,
      };
    }

    case "create_reminder": {
      if (!args.target || !args.action || !args.time) {
        throw new Error("create_reminder 缺少必要參數");
      }

      const owner = buildSessionKey(context.source);
      const reminderTime = new Date(args.time);

      if (Number.isNaN(reminderTime.getTime())) {
        throw new Error(`create_reminder 時間格式錯誤：${args.time}`);
      }

      if (reminderTime <= new Date()) {
        throw new Error(`create_reminder 時間已過：${args.time}`);
      }

      const reminderId = await createReminder({
        owner,
        target: args.target,
        action: args.action,
        time: reminderTime,
      });

      return {
        ok: true,
        tool: name,
        reminderId,
        owner,
        target: args.target,
        action: args.action,
        time: reminderTime.toISOString(),
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

    case "add_watch_stock": {
      const owner = buildSessionKey(context.source);

      if (!owner) {
        throw new Error("add_watch_stock 無法取得 owner");
      }

      if (!args.symbol) {
        throw new Error("add_watch_stock 缺少股票代碼 symbol");
      }

      const result = await addWatchStock(owner, args.symbol);

      return {
        ok: true,
        tool: name,
        owner,
        ...result,
      };
    }

    case "remove_watch_stock": {
      const owner = buildSessionKey(context.source);

      if (!owner) {
        throw new Error("remove_watch_stock 無法取得 owner");
      }

      if (!args.symbol) {
        throw new Error("remove_watch_stock 缺少股票代碼 symbol");
      }

      const result = await removeWatchStock(owner, args.symbol);

      return {
        ok: true,
        tool: name,
        owner,
        ...result,
      };
    }

    case "list_watch_stocks": {
      const owner = buildSessionKey(context.source);

      if (!owner) {
        throw new Error("list_watch_stocks 無法取得 owner");
      }

      const result = await listWatchStocks(owner);

      return {
        ok: true,
        tool: name,
        owner,
        ...result,
      };
    }

    case "get_watch_prices": {
      const owner = buildSessionKey(context.source);

      if (!owner) {
        throw new Error("get_watch_prices 無法取得 owner");
      }

      const result = await getWatchPrices(owner);

      return {
        ok: true,
        tool: name,
        owner,
        ...result,
      };
    }

    default:
      throw new Error(`未知的工具名稱：${name}`);
  }
}