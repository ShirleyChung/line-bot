// src/handlers/weatherHandler.js

import { replyText } from "../line/reply.js";

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

  const cityToSet = parseSetDefaultWeatherCity(text);

  if (cityToSet) {
    const result = setDefaultWeatherCity(userId, cityToSet);

    await replyText(event.replyToken, result.message);

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

  await replyText(event.replyToken, formatWeatherReply(data));

  return true;
}