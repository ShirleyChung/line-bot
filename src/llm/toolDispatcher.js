import { createReminder, listReminders, deleteReminderByOwner } from "../services/reminderService.js";
import { normalizeReminderData } from "../services/reminderContentService.js";
import { buildSessionKey } from "../services/conversationStateService.js";
import { getTodayLinkFromSheet } from "../services/sheetLinkService.js";
import { replyText } from "../platform/reply.js";
import { lineClient } from "../line/client.js";

import { fetchImageBuffer } from "../services/imageService.js";
import { ocrImage } from "../services/ocrService.js";
import { parseOCRToJSON } from "../services/dataParserService.js";
import {
  clearImageIds,
  getLastBibleContext,
  setLastBibleContext,
} from "../services/sessionStateService.js";
import {
  addWatchStock,
  removeWatchStock,
  listWatchStocks,
  getWatchPrices,
} from "../services/stockSelectService.js";
import { fetchTaiwanStockLatest } from "../services/taiwanStockService.js";
import { fetchUSStockLatest } from "../services/finnhubService.js";
import { fetchYahooFuturesQuote } from "../services/yahooFuturesService.js";
import { resolveFuturesSymbol } from "../services/futuresSymbolService.js";
import { buildWatchPricesMessage, buildFuturesQuoteMessage } from "../utils/format.js";
import { fetchNews } from "../services/newsService.js";
import { buildLatestArxivPaperDigest } from "../services/arxivPaperService.js";
import { buildNewsMessage } from "../utils/format.js";
import {
  formatWeatherReply,
  getWeatherForUser,
  setDefaultWeatherCity,
} from '../services/weatherService.js';
import {
  findNearbyFacilities,
  findNearbyParking,
  formatDistance,
  getRouteInfo,
  findLandmarksAlongRoute,
  findFacilitiesAlongRoute,
} from "../services/placesService.js";
import {
  getRandomRecoveryBibleVerse,
  queryLifeStudyExcerpt,
  queryRecoveryBibleNotes,
  queryRecoveryBibleVerses,
} from "../services/recoveryBibleService.js";

function detectMarket(symbol) {
  const code = String(symbol).trim().toUpperCase();
  if (/^[A-Z]+$/.test(code) && code.length >= 1 && code.length <= 5) {
    return "US";
  }
  return "TW";
}

const ROUTE_MODE_LABELS = {
  driving: "開車",
  walking: "步行",
  transit: "大眾運輸",
  bicycling: "騎自行車",
};

function normalizeRouteMode(mode, toolName) {
  const value = String(mode || "driving").trim().toLowerCase();
  if (!ROUTE_MODE_LABELS[value]) {
    throw new Error(`${toolName} 不支援的交通方式：${mode}`);
  }
  return value;
}

function getRouteModeLabel(mode) {
  return ROUTE_MODE_LABELS[mode] || mode;
}

/**
 * 工具執行器是 LLM function call 與實際 service 之間的轉接層。
 * 這裡負責驗證參數、補齊 owner/session 等上下文，並把 service 結果整理成模型可讀格式。
 *
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

function formatParkingToolReply(locationQuery, result) {
  if (!result.ok) return result.message;

  if (!result.parkingLots.length) {
    return `「${locationQuery}」附近 ${result.radiusMeters} 公尺內查不到停車場。`;
  }

  const lines = [
    `「${locationQuery}」附近停車場：`,
    `定位：${result.origin.name}`,
    "",
  ];

  for (const [index, place] of result.parkingLots.entries()) {
    lines.push(
      `${index + 1}. ${place.name}`,
      `地址：${place.address}`,
      `距離：約 ${formatDistance(place.distanceMeters)}`
    );

    if (place.googleMapsUri) {
      lines.push(`地圖：${place.googleMapsUri}`);
    }

    if (index !== result.parkingLots.length - 1) {
      lines.push("");
    }
  }

  return lines.join("\n");
}

function formatNearbyFacilityToolReply(locationQuery, facilityQuery, result) {
  if (!result.ok) return result.message;

  if (!result.facilities.length) {
    return `「${locationQuery}」附近 ${result.radiusMeters} 公尺內查不到${facilityQuery}。`;
  }

  const lines = [
    `「${locationQuery}」附近${facilityQuery}：`,
    `定位：${result.origin.name}`,
    "",
  ];

  for (const [index, place] of result.facilities.entries()) {
    lines.push(
      `${index + 1}. ${place.name}`,
      `地址：${place.address}`,
      `距離：約 ${formatDistance(place.distanceMeters)}`
    );

    if (place.rating) {
      const count = place.userRatingCount ? `（${place.userRatingCount} 則）` : "";
      lines.push(`評分：${place.rating}${count}`);
    }

    if (place.googleMapsUri) {
      lines.push(`地圖：${place.googleMapsUri}`);
    }

    if (index !== result.facilities.length - 1) {
      lines.push("");
    }
  }

  return lines.join("\n");
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
      const imageIds = Array.isArray(context.imageIds) && context.imageIds.length
        ? context.imageIds
        : [context.latestImageId].filter(Boolean);

      if (!imageIds.length) {
        throw new Error("沒有可用的圖片");
      }

      const images = [];
      for (const [index, imageId] of imageIds.entries()) {
        // 每張圖依序下載、OCR、轉結構化資料，最後保留原始文字方便除錯或二次整理。
        const buffer = await fetchImageBuffer(imageId);
        const text = await ocrImage(buffer);
        const data = await parseOCRToJSON(text);

        images.push({
          index: index + 1,
          imageId,
          text,
          data,
        });
      }

      await clearImageIds(context.sessionKey || buildSessionKey(context.source));
      context.imageIds = [];
      context.latestImageId = null;

      return {
        ok: true,
        count: images.length,
        data: images.length === 1 ? images[0].data : images.map((image) => image.data),
        images,
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
      // LLM 可能依工具類型填 city/symbol/action，不同提醒在這裡收斂成共通 target/action。
      const derivedTarget =
        args.target ||
        args.city ||
        args.symbol ||
        (reminderType === "bible_verse" ? "聖經" : "提醒");
      const derivedAction =
        args.action ||
        args.symbol ||
        (reminderType === "weather" && args.city ? `${args.city}天氣` : "") ||
        (reminderType === "watch_prices" ? "自選股股價" : "") ||
        (reminderType === "today_link" ? "今日連結" : "") ||
        (reminderType === "arxiv_papers" ? "最新 arXiv 論文摘要" : "") ||
        (reminderType === "bible_verse" ? "隨機聖經經節" : "");

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
      // payload 保留各提醒類型需要的額外資料，之後 cron 產生提醒內容時會使用。
      if (args.city) payload.city = args.city;
      if (args.symbol) payload.symbol = args.symbol;
      if (args.weatherTarget) payload.target = args.weatherTarget;
      if (reminderType === "arxiv_papers") {
        payload.max = Math.min(Math.max(Number(args.paperCount) || 6, 5), 8);
      }

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

      await replyText(context.event || { replyToken: context.replyToken }, message);

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
        price = await fetchTaiwanStockLatest(symbol);
      }

      const text = buildWatchPricesMessage([price]);

      return {
        ok: true,
        tool: name,
        price,
        text,
      };
    }

    case "get_futures_price": {
      const resolved = resolveFuturesSymbol(args.commodity, args.contract);
      if (!resolved.ok) {
        return {
          ok: true,
          tool: name,
          text: resolved.message,
        };
      }

      const quote = await fetchYahooFuturesQuote(resolved.symbol);
      // 不論成功失敗，都讓 buildFuturesQuoteMessage 直接組好回覆字串給使用者
      const text = buildFuturesQuoteMessage(quote, {
        commodity: args.commodity,
        contract: args.contract,
      });

      return {
        ok: true,
        tool: name,
        yahooSymbol: resolved.symbol,
        quote,
        text,
      };
    }

    case "get_latest_arxiv_papers": {
      const text = await buildLatestArxivPaperDigest({
        max: args.max || 6,
      });

      return {
        ok: true,
        tool: name,
        type: "text",
        text,
      };
    }

    case "find_nearby_parking": {
      const locationQuery = String(args.locationQuery || "").trim();

      if (!locationQuery) {
        throw new Error("find_nearby_parking 缺少地點 locationQuery");
      }

      const result = await findNearbyParking(locationQuery, {
        radiusMeters: Number(args.radiusMeters) || 1000,
        limit: Number(args.limit) || 5,
      });

      return {
        ok: result.ok,
        tool: name,
        locationQuery,
        radiusMeters: result.radiusMeters,
        origin: result.origin,
        parkingLots: result.parkingLots,
        replyText: formatParkingToolReply(locationQuery, result),
      };
    }

    case "find_nearby_facilities": {
      const locationQuery = String(args.locationQuery || "").trim();
      const facilityQuery = String(args.facilityQuery || "").trim();

      if (!locationQuery) {
        throw new Error("find_nearby_facilities 缺少地點 locationQuery");
      }

      if (!facilityQuery) {
        throw new Error("find_nearby_facilities 缺少設施 facilityQuery");
      }

      const result = await findNearbyFacilities(locationQuery, facilityQuery, {
        radiusMeters: Number(args.radiusMeters) || 1000,
        limit: Number(args.limit) || 5,
      });

      return {
        ok: result.ok,
        tool: name,
        locationQuery,
        facilityQuery,
        radiusMeters: result.radiusMeters,
        origin: result.origin,
        facilities: result.facilities,
        replyText: formatNearbyFacilityToolReply(locationQuery, facilityQuery, result),
      };
    }

    case "get_recovery_bible_verses": {
      const sessionKey = context.sessionKey || buildSessionKey(context.source);
      const hasSessionContext = sessionKey && sessionKey !== "unknown";
      const query = String(args.query || "").trim();

      if (!query) {
        throw new Error("get_recovery_bible_verses 缺少查詢內容 query");
      }

      const result = await queryRecoveryBibleVerses(query, {
        maxResults: Number(args.maxResults) || 5,
      });

      if (hasSessionContext) {
        await setLastBibleContext(sessionKey, {
          query,
          reference: result.reference?.displayRef || "",
          keyword: result.keyword || "",
          mode: result.mode || "verse",
        });
      }

      return {
        ok: true,
        tool: name,
        ...result,
      };
    }

    case "get_random_bible_verse": {
      const sessionKey = context.sessionKey || buildSessionKey(context.source);
      const hasSessionContext = sessionKey && sessionKey !== "unknown";
      const result = await getRandomRecoveryBibleVerse();

      if (hasSessionContext) {
        await setLastBibleContext(sessionKey, {
          query: result.reference?.displayRef || "",
          reference: result.reference?.displayRef || "",
          keyword: "",
          mode: "random_verse",
        });
      }

      return {
        ok: true,
        tool: name,
        ...result,
      };
    }

    case "get_recovery_bible_notes": {
      const sessionKey = context.sessionKey || buildSessionKey(context.source);
      const hasSessionContext = sessionKey && sessionKey !== "unknown";
      const lastContext = hasSessionContext ? await getLastBibleContext(sessionKey) : null;
      const fallbackQuery = lastContext?.reference || lastContext?.query || "";
      const query = String(args.query || fallbackQuery || "").trim();

      if (!query) {
        throw new Error("get_recovery_bible_notes 缺少查詢內容，請提供經節或先查詢聖經經文");
      }

      const result = await queryRecoveryBibleNotes(query, {
        maxResults: Number(args.maxResults) || 4,
      });

      if (hasSessionContext) {
        await setLastBibleContext(sessionKey, {
          query: lastContext?.query || query,
          reference: result.reference?.displayRef || lastContext?.reference || "",
          keyword: result.keyword || lastContext?.keyword || "",
          mode: "note",
        });
      }

      return {
        ok: true,
        tool: name,
        ...result,
      };
    }

    case "get_life_study_excerpt": {
      const sessionKey = context.sessionKey || buildSessionKey(context.source);
      const hasSessionContext = sessionKey && sessionKey !== "unknown";
      const lastContext = hasSessionContext ? await getLastBibleContext(sessionKey) : null;
      const fallbackQuery = lastContext?.reference || lastContext?.query || "";
      const query = String(args.query || fallbackQuery || "").trim();
      const keyword = String(args.keyword || lastContext?.keyword || "").trim();

      if (!query && !keyword) {
        throw new Error("get_life_study_excerpt 缺少查詢內容，請提供經節或關鍵字");
      }

      const result = await queryLifeStudyExcerpt({
        query,
        keyword,
      });

      if (hasSessionContext) {
        await setLastBibleContext(sessionKey, {
          query: query || lastContext?.query || "",
          reference: result.chapter && result.bookNo ? `${result.bookName} ${result.chapter}章` : (lastContext?.reference || ""),
          keyword: keyword || lastContext?.keyword || "",
          mode: "life_study",
        });
      }

      return {
        ok: true,
        tool: name,
        ...result,
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
      const userId = args.userId || context.userId || context.source?.userId || null;
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
      const userId = args.userId || context.userId || context.source?.userId || null;
      const city = args.city;

      const result = await setDefaultWeatherCity(userId, city);

      return {
        ok: result.ok,
        type: 'set_default_weather_city',
        data: result,
        replyText: result.message,
      };
    }
    
    case "get_route_info": {
      const originQuery = String(args.originQuery || "").trim();
      const destinationQuery = String(args.destinationQuery || "").trim();
      const mode = normalizeRouteMode(args.mode, "get_route_info");
      
      if (!originQuery) {
        throw new Error("get_route_info 缺少出發地 originQuery");
      }
      
      if (!destinationQuery) {
        throw new Error("get_route_info 缺少目的地 destinationQuery");
      }
      
      const result = await getRouteInfo(originQuery, destinationQuery, mode);
      
      if (!result.ok) {
        return {
          ok: false,
          tool: name,
          message: result.message,
        };
      }
      
      const modeText = getRouteModeLabel(mode);
      
      const replyText = [
        `從「${result.origin.name}」到「${result.destination.name}」（${modeText}）：`,
        ``,
        `📍 距離：${result.distanceText}`,
        `⏱️ 預估時間：${result.durationText}`,
      ].join("\n");
      
      return {
        ok: true,
        tool: name,
        origin: result.origin,
        destination: result.destination,
        distance: result.distance,
        duration: result.duration,
        distanceText: result.distanceText,
        durationText: result.durationText,
        mode,
        replyText,
      };
    }
    
    case "find_landmarks_along_route": {
      const originQuery = String(args.originQuery || "").trim();
      const destinationQuery = String(args.destinationQuery || "").trim();
      const mode = normalizeRouteMode(args.mode, "find_landmarks_along_route");
      const limit = Number(args.limit) || 5;
      
      if (!originQuery) {
        throw new Error("find_landmarks_along_route 缺少出發地 originQuery");
      }
      
      if (!destinationQuery) {
        throw new Error("find_landmarks_along_route 缺少目的地 destinationQuery");
      }
      
      const result = await findLandmarksAlongRoute(originQuery, destinationQuery, {
        mode,
        limit,
      });
      
      if (!result.ok) {
        return {
          ok: false,
          tool: name,
          message: result.message,
        };
      }
      
      const modeText = getRouteModeLabel(mode);
      
      const lines = [
        `從「${result.origin.name}」到「${result.destination.name}」（${modeText}）：`,
        `📍 距離：${result.distanceText}`,
        `⏱️ 預估時間：${result.durationText}`,
        ``,
      ];
      
      if (!result.landmarks || result.landmarks.length === 0) {
        lines.push("沿途未找到知名地標或景點。");
      } else {
        lines.push(`沿途地標/景點（共 ${result.landmarks.length} 個）：`);
        lines.push("");
        
        for (const [index, landmark] of result.landmarks.entries()) {
          lines.push(`${index + 1}. ${landmark.name}`);
          lines.push(`   地址：${landmark.address}`);
          
          if (landmark.rating) {
            const count = landmark.userRatingCount ? ` (${landmark.userRatingCount} 則評論)` : "";
            lines.push(`   評分：${landmark.rating}${count}`);
          }
          
          if (landmark.googleMapsUri) {
            lines.push(`   地圖：${landmark.googleMapsUri}`);
          }
          
          if (index !== result.landmarks.length - 1) {
            lines.push("");
          }
        }
      }
      
      return {
        ok: true,
        tool: name,
        origin: result.origin,
        destination: result.destination,
        distance: result.distance,
        duration: result.duration,
        distanceText: result.distanceText,
        durationText: result.durationText,
        mode,
        landmarks: result.landmarks,
        replyText: lines.join("\n"),
      };
    }
    
    case "find_facilities_along_route": {
      const originQuery = String(args.originQuery || "").trim();
      const destinationQuery = String(args.destinationQuery || "").trim();
      const facilityQuery = String(args.facilityQuery || "").trim();
      const mode = normalizeRouteMode(args.mode, "find_facilities_along_route");
      const limit = Number(args.limit) || 5;
      
      if (!originQuery) {
        throw new Error("find_facilities_along_route 缺少出發地 originQuery");
      }
      
      if (!destinationQuery) {
        throw new Error("find_facilities_along_route 缺少目的地 destinationQuery");
      }
      
      if (!facilityQuery) {
        throw new Error("find_facilities_along_route 缺少設施 facilityQuery");
      }
      
      const result = await findFacilitiesAlongRoute(
        originQuery,
        destinationQuery,
        facilityQuery,
        {
          mode,
          limit,
        }
      );
      
      if (!result.ok) {
        return {
          ok: false,
          tool: name,
          message: result.message,
        };
      }
      
      const modeText = getRouteModeLabel(mode);
      
      const lines = [
        `從「${result.origin.name}」到「${result.destination.name}」（${modeText}）：`,
        `📍 距離：${result.distanceText}`,
        `⏱️ 預估時間：${result.durationText}`,
        ``,
      ];
      
      if (!result.facilities || result.facilities.length === 0) {
        lines.push(`沿途未找到${facilityQuery}。`);
      } else {
        lines.push(`沿途${facilityQuery}（共 ${result.facilities.length} 個）：`);
        lines.push("");
        
        for (const [index, facility] of result.facilities.entries()) {
          lines.push(`${index + 1}. ${facility.name}`);
          lines.push(`   地址：${facility.address}`);
          
          if (facility.rating) {
            const count = facility.userRatingCount ? ` (${facility.userRatingCount} 則評論)` : "";
            lines.push(`   評分：${facility.rating}${count}`);
          }
          
          if (facility.googleMapsUri) {
            lines.push(`   地圖：${facility.googleMapsUri}`);
          }
          
          if (index !== result.facilities.length - 1) {
            lines.push("");
          }
        }
      }
      
      return {
        ok: true,
        tool: name,
        origin: result.origin,
        destination: result.destination,
        distance: result.distance,
        duration: result.duration,
        distanceText: result.distanceText,
        durationText: result.durationText,
        mode,
        facilityQuery,
        facilities: result.facilities,
        hasFacilities: result.hasFacilities,
        replyText: lines.join("\n"),
      };
    }

    default:
      throw new Error(`未知的工具名稱：${name}`);
  }
}
