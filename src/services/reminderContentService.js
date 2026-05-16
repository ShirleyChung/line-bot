import { get_today_link } from "./sheetLinkService.js";
import { getWeatherForUser, formatWeatherReply } from "./weatherService.js";
import { fetchTaiwanStockLatest } from "./taiwanStockService.js";
import { fetchUSStockLatest } from "./finnhubService.js";
import { getWatchPrices } from "./stockSelectService.js";
import { buildWatchPricesMessage } from "../utils/format.js";
import { buildLatestArxivPaperDigest } from "./arxivPaperService.js";

export const REMINDER_TYPES = new Set([
  "generic",
  "weather",
  "stock",
  "watch_prices",
  "today_link",
  "arxiv_papers",
]);

export const RECURRENCES = new Set(["none", "daily"]);

/**
 * 偵測股票所屬市場
 * @param {string} symbol - 股票代碼
 * @returns {string} "US" 或 "TW"
 */
function detectMarket(symbol) {
  const code = String(symbol || "").trim().toUpperCase();
  if (/^[A-Z]+$/.test(code) && code.length >= 1 && code.length <= 5) {
    return "US";
  }
  return "TW";
}

/**
 * 正規化提醒類型
 * @param {string} type - 提醒類型
 * @returns {string} 正規化後的類型
 */
function normalizeReminderType(type) {
  const value = String(type || "generic").trim();
  return REMINDER_TYPES.has(value) ? value : "generic";
}

/**
 * 正規化重複週期
 * @param {string} recurrence - 重複週期
 * @returns {string} "none" 或 "daily"
 */
function normalizeRecurrence(recurrence) {
  const value = String(recurrence || "none").trim();
  return RECURRENCES.has(value) ? value : "none";
}

/**
 * 正規化提醒資料
 * @param {object} data - 提醒資料
 * @returns {object} 正規化後的資料
 */
export function normalizeReminderData(data = {}) {
  const payload = data.payload && typeof data.payload === "object" ? data.payload : {};

  return {
    ...data,
    reminderType: normalizeReminderType(data.reminderType),
    recurrence: normalizeRecurrence(data.recurrence),
    payload,
  };
}

/**
 * 計算下次提醒時間（用於每日提醒）
 * @param {object} reminder - 提醒物件
 * @param {Date} from - 計算起點時間
 * @returns {Date|null} 下次提醒時間或 null
 */
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

/**
 * 建構股價提醒訊息
 * @param {object} reminder - 提醒物件
 * @returns {Promise<string>} 提醒訊息
 */
async function buildStockReminderMessage(reminder) {
  const symbol = String(reminder.payload?.symbol || reminder.action || "").trim().toUpperCase();

  if (!symbol) {
    return "股價提醒設定缺少股票代碼。";
  }

  const market = detectMarket(symbol);
  const price = market === "US"
    ? await fetchUSStockLatest(symbol)
    : await fetchTaiwanStockLatest(symbol);

  return `股價提醒\n${buildWatchPricesMessage([price])}`;
}

/**
 * 建構天氣提醒訊息
 * @param {object} reminder - 提醒物件
 * @returns {Promise<string>} 提醒訊息
 */
async function buildWeatherReminderMessage(reminder) {
  const city = reminder.payload?.city || reminder.target;
  const target = reminder.payload?.target || "now";
  const data = await getWeatherForUser({ city, target });
  return `天氣提醒\n${formatWeatherReply(data)}`;
}

/**
 * 建構 arXiv 論文提醒訊息
 * @param {object} reminder - 提醒物件
 * @returns {Promise<string>} 提醒訊息
 */
async function buildArxivPaperReminderMessage(reminder) {
  const max = reminder.payload?.max || 6;
  const categories = Array.isArray(reminder.payload?.categories)
    ? reminder.payload.categories
    : undefined;
  const digest = await buildLatestArxivPaperDigest({ max, categories });
  return `最新 CS / Engineering 論文摘要\n${digest}`;
}

/**
 * 根據提醒類型建構提醒訊息
 * @param {object} reminder - 提醒物件
 * @returns {Promise<string>} 提醒訊息
 */
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

    case "arxiv_papers":
      return buildArxivPaperReminderMessage(normalized);

    case "generic":
    default:
      return `${normalized.action} 囉`;
  }
}
