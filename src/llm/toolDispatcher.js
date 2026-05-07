import { createReminder, listReminders, deleteReminderByOwner } from "../services/reminderService.js";
import { normalizeReminderData } from "../services/reminderContentService.js";
import { buildSessionKey } from "../services/conversationStateService.js";
import { getTodayLinkFromSheet } from "../services/sheetLinkService.js";
import { replyText } from "../line/reply.js";
import { lineClient } from "../line/client.js";

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
import { fetchTwseLatestClose } from "../services/twseStockDayService.js";
import { fetchUSStockLatest } from "../services/finnhubService.js";
import { buildWatchPricesMessage } from "../utils/format.js";
import { fetchNews } from "../services/newsService.js";
import { buildNewsMessage } from "../utils/format.js";
import {
  formatWeatherReply,
  getWeatherForUser,
  setDefaultWeatherCity,
} from '../services/weatherService.js';

function detectMarket(symbol) {
  const code = String(symbol).trim().toUpperCase();
  if (/^[A-Z]+$/.test(code) && code.length >= 1 && code.length <= 5) {
    return "US";
  }
  return "TW";
}

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

function escapeCsvValue(value) {
  const s = value == null ? "" : String(value);

  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }

  return s;
}

function rowsToCSV(fields, rows) {
  const header = fields.map(escapeCsvValue).join(",");

  const body = rows
    .map((row) => {
      if (!Array.isArray(row)) {
        throw new Error("json_to_csv 的每一列都必須是陣列");
      }

      return row.map(escapeCsvValue).join(",");
    })
    .join("\n");

  return `${header}\n${body}`;
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
      const { fields, rows } = args;
      if (!Array.isArray(fields)) {
        throw new Error("json_to_csv 的 fields 必須是陣列");
      }
      if (!Array.isArray(rows)) {
        throw new Error("json_to_csv 的 rows 必須是二維陣列");
      }
      const csv = rowsToCSV(fields, rows);
      return {
        ok: true,
        csv,
      };
    }

    case "create_reminder": {
      const reminderType = args.reminderType || "generic";
      const derivedTarget = args.target || args.city || args.symbol || "提醒";
      const derivedAction =
        args.action ||
        args.symbol ||
        (reminderType === "weather" && args.city ? `${args.city}天氣` : "") ||
        (reminderType === "watch_prices" ? "自選股股價" : "") ||
        (reminderType === "today_link" ? "今日連結" : "");

      if (!derivedTarget || !derivedAction || !args.time) {
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

      const payload = {};
      if (args.city) payload.city = args.city;
      if (args.symbol) payload.symbol = args.symbol;
      if (args.weatherTarget) payload.target = args.weatherTarget;

      const reminderData = normalizeReminderData({
        owner,
        target: derivedTarget,
        action: derivedAction,
        time: reminderTime,
        recurrence: args.recurrence || "none",
        reminderType,
        payload,
      });

      const reminderId = await createReminder(reminderData);

      return {
        ok: true,
        tool: name,
        reminderId,
        owner,
        target: reminderData.target,
        action: reminderData.action,
        recurrence: reminderData.recurrence,
        reminderType: reminderData.reminderType,
        payload: reminderData.payload,
        time: reminderTime.toISOString(),
      };
    }

    case "list_reminders": {
      const owner = buildSessionKey(context.source);

      if (!owner) {
        throw new Error("list_reminders 無法取得 owner");
      }

      const reminders = await listReminders(owner);

      return {
        ok: true,
        tool: name,
        owner,
        count: reminders.length,
        reminders: reminders.map((r) => ({
          id: r.id,
          target: r.target,
          action: r.action,
          recurrence: r.recurrence || "none",
          reminderType: r.reminderType || "generic",
          payload: r.payload || {},
          time: r.time?.toDate ? r.time.toDate().toISOString() : r.time,
        })),
      };
    }

    case "delete_reminder": {
      const owner = buildSessionKey(context.source);

      if (!owner) {
        throw new Error("delete_reminder 無法取得 owner");
      }

      const criteria = {};
      if (args.id) criteria.id = args.id;
      if (args.target) criteria.target = args.target;
      if (args.action) criteria.action = args.action;

      if (!criteria.id && !criteria.target && !criteria.action) {
        throw new Error("delete_reminder 需要至少提供 id、target 或 action 其中一項");
      }

      const result = await deleteReminderByOwner(owner, criteria);

      return {
        ok: true,
        tool: name,
        owner,
        ...result,
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
      const text = buildWatchPricesMessage(result.prices || []);

      return {
        ok: true,
        tool: name,
        owner,
        ...result,
        text,
      };
    }

    case "get_stock_price": {
      const symbol = String(args.symbol || "").trim().toUpperCase();

      if (!symbol) {
        throw new Error("get_stock_price 缺少股票代碼 symbol");
      }

      const market = detectMarket(symbol);
      let price;

      if (market === "US") {
        price = await fetchUSStockLatest(symbol);
      } else {
        price = await fetchTwseLatestClose(symbol);
      }

      const text = buildWatchPricesMessage([price]);

      return {
        ok: true,
        tool: name,
        price,
        text,
      };
    }
    case "searchNews": {
      const query = args.query;
      const news = await fetchNews({
        query,
        lang: args.lang || "zh",
        country: args.country || "tw",
        max: args.max || 5,
      });
      return {
        type: "text",
        text: buildNewsMessage(news, query),
      };
    }
    case 'get_weather': {
      const userId = args.userId || context.userId || null;
      const city = args.city || null;
      const target = args.target || 'now';

      const data = await getWeatherForUser({
        city,
        userId,
        target,
      });

      return {
        ok: data.ok,
        type: 'weather',
        data,
        replyText: formatWeatherReply(data),
      };
    }
    case 'set_default_weather_city': {
      const userId = args.userId || context.userId || null;
      const city = args.city;

      const result = setDefaultWeatherCity(userId, city);

      return {
        ok: result.ok,
        type: 'set_default_weather_city',
        data: result,
        replyText: result.message,
      };
    }

    default:
      throw new Error(`未知的工具名稱：${name}`);
  }
}
