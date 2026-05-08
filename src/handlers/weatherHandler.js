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

  if (/(提醒|排程|每天|每日|固定)/.test(text)) {
    return false;
  }

  const cityToSet = parseSetDefaultWeatherCity(text);

  if (cityToSet) {
    const result = setDefaultWeatherCity(userId, cityToSet);

    await replyText(event, result.message);

    return true;
  }

  if (!isWeatherIntent(text)) {
    return false;
  }

  const target = text.includes("明天") ? "tomorrow" : "now";

  const data = await getWeatherForUser({
    text,
    userId,
    target,
  });

  await replyText(event, formatWeatherReply(data));

  return true;
}
