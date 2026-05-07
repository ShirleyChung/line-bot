import { get_today_link } from "./sheetLinkService.js";
import { getWeatherForUser, formatWeatherReply } from "./weatherService.js";
import { fetchTwseLatestClose } from "./twseStockDayService.js";
import { fetchUSStockLatest } from "./finnhubService.js";
import { getWatchPrices } from "./stockSelectService.js";
import { buildWatchPricesMessage } from "../utils/format.js";

export const REMINDER_TYPES = new Set([
  "generic",
  "weather",
  "stock",
  "watch_prices",
  "today_link",
]);

export const RECURRENCES = new Set(["none", "daily"]);

function detectMarket(symbol) {
  const code = String(symbol || "").trim().toUpperCase();
  if (/^[A-Z]+$/.test(code) && code.length >= 1 && code.length <= 5) {
    return "US";
  }
  return "TW";
}

function normalizeReminderType(type) {
  const value = String(type || "generic").trim();
  return REMINDER_TYPES.has(value) ? value : "generic";
}

function normalizeRecurrence(recurrence) {
  const value = String(recurrence || "none").trim();
  return RECURRENCES.has(value) ? value : "none";
}

export function normalizeReminderData(data = {}) {
  const payload = data.payload && typeof data.payload === "object" ? data.payload : {};

  return {
    ...data,
    reminderType: normalizeReminderType(data.reminderType),
    recurrence: normalizeRecurrence(data.recurrence),
    payload,
  };
}

export function getNextReminderTime(reminder, from = new Date()) {
  const recurrence = normalizeRecurrence(reminder?.recurrence);
  if (recurrence !== "daily") return null;

  const rawTime = reminder.time?.toDate ? reminder.time.toDate() : new Date(reminder.time);
  if (Number.isNaN(rawTime.getTime())) return null;

  const next = new Date(rawTime);
  while (next <= from) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

async function buildStockReminderMessage(reminder) {
  const symbol = String(reminder.payload?.symbol || reminder.action || "").trim().toUpperCase();

  if (!symbol) {
    return "股價提醒設定缺少股票代碼。";
  }

  const market = detectMarket(symbol);
  const price = market === "US"
    ? await fetchUSStockLatest(symbol)
    : await fetchTwseLatestClose(symbol);

  return `股價提醒\n${buildWatchPricesMessage([price])}`;
}

async function buildWeatherReminderMessage(reminder) {
  const city = reminder.payload?.city || reminder.target;
  const target = reminder.payload?.target || "now";
  const data = await getWeatherForUser({ city, target });
  return `天氣提醒\n${formatWeatherReply(data)}`;
}

export async function buildReminderMessage(reminder) {
  const normalized = normalizeReminderData(reminder);

  switch (normalized.reminderType) {
    case "weather":
      return buildWeatherReminderMessage(normalized);

    case "stock":
      return buildStockReminderMessage(normalized);

    case "watch_prices": {
      const result = await getWatchPrices(normalized.owner);
      return `自選股提醒\n${buildWatchPricesMessage(result.prices || [])}`;
    }

    case "today_link":
      return get_today_link();

    case "generic":
    default:
      return `${normalized.action} 囉`;
  }
}
