// src/handlers/weatherHandler.js

import { replyText } from "../platform/reply.js";

import {
  isWeatherIntent,
  parseSetDefaultWeatherCity,
  setDefaultWeatherCity,
  getWeatherForUser,
  formatWeatherReply,
} from "../services/weatherService.js";

/**
 * 處理天氣相關訊息
 * @param {object} event - webhook event
 * @returns {Promise<boolean>} 是否處理成功
 */
export async function handleWeatherMessage(event) {
  if (event.type !== "message") return false;
  if (event.message?.type !== "text") return false;

  const text = event.message.text.trim();
  const userId = event.source?.userId;

  // 天氣提醒屬於 LLM tool 流程，這裡只處理立即查詢與預設地點設定。
  if (/(提醒|排程|每天|每日|固定)/.test(text)) {
    return false;
  }

  const cityToSet = parseSetDefaultWeatherCity(text);

  if (cityToSet) {
    const result = await setDefaultWeatherCity(userId, cityToSet);

    await replyText(event, result.message);

    return true;
  }

  if (!isWeatherIntent(text)) {
    return false;
  }

  const target = /未來\s*(?:一)?[週周]|(?:這|下)[週周]|一[週周]天氣/.test(text)
    ? "week"
    : text.includes("後天") || text.includes("大後天")
      ? "day_after_tomorrow"
      : text.includes("明天")
        ? "tomorrow"
        : "now";

  const data = await getWeatherForUser({
    text,
    userId,
    target,
  });

  // 沒指定地點且沒有預設地點時，直接由 handler 給提示，
  // 不再退回 LLM 反覆詢問地點。
  await replyText(event, formatWeatherReply(data));

  return true;
}
