// src/handlers/weatherHandler.js

import { replyText } from "../platform/reply.js";

import {
  isWeatherIntent,
  parseSetDefaultWeatherCity,
  setDefaultWeatherCity,
  getWeatherForUser,
  formatWeatherReply,
} from "../services/weatherService.js";

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

  // 目前 CWA 36 小時預報只需要區分現在與明天兩種常用時段。
  const target = text.includes("明天") ? "tomorrow" : "now";

  const data = await getWeatherForUser({
    text,
    userId,
    target,
  });

  if (data?.reason === "need_city") {
    return false;
  }

  await replyText(event, formatWeatherReply(data));

  return true;
}
