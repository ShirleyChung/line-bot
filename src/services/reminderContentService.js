import { get_today_link } from "./sheetLinkService.js";
import { getWeatherForUser, formatWeatherReply } from "./weatherService.js";
import { fetchTaiwanStockLatest } from "./taiwanStockService.js";
import { fetchUSStockLatest } from "./finnhubService.js";
import { getWatchPrices } from "./stockSelectService.js";
import { buildWatchPricesMessage, buildFuturesQuoteMessage } from "../utils/format.js";
import { fetchYahooFuturesQuote } from "./yahooFuturesService.js";
import { resolveFuturesSymbol } from "./futuresSymbolService.js";
import { buildLatestArxivPaperDigest } from "./arxivPaperService.js";
import {
  getRandomRecoveryBibleVerse,
  getBookOutlineReminderItems,
  getOutlineItemContent,
} from "./recoveryBibleService.js";
import { updateReminderPayload } from "./reminderService.js";
import { fetchTopHeadlines, buildTopHeadlinesMessage } from "./topHeadlinesService.js";
import { fetchNews } from "./newsService.js";
import { buildNewsMessage } from "../utils/format.js";

export const REMINDER_TYPES = new Set([
  "generic",
  "weather",
  "stock",
  "futures",
  "watch_prices",
  "today_link",
  "arxiv_papers",
  "cnn_news",
  "top_headlines",
  "general_news",
  "bible_verse",
  "bible_outline",
]);

export const RECURRENCES = new Set(["none", "daily", "weekly"]);

// 以 Asia/Taipei 當地時間判斷星期幾（0=星期日 … 6=星期六）。
// 雲端執行環境為 UTC，靠近午夜時 Date.getDay() 會算錯台北的星期，故用 Intl 取台北星期。
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * 取得某個時間點在 Asia/Taipei 的星期幾
 * @param {Date} date - 時間點
 * @returns {number} 0（星期日）到 6（星期六）
 */
export function getTaipeiWeekday(date) {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    weekday: "short",
  }).format(date);
  return WEEKDAY_INDEX[label] ?? date.getDay();
}

/**
 * 正規化每週提醒的星期清單
 * @param {Array} weekDays - 星期陣列，元素為 0-6
 * @returns {number[]} 去重、排序後的合法星期陣列
 */
export function normalizeWeekDays(weekDays) {
  if (!Array.isArray(weekDays)) return [];
  const set = new Set();
  for (const day of weekDays) {
    const num = Number(day);
    if (Number.isInteger(num) && num >= 0 && num <= 6) set.add(num);
  }
  return [...set].sort((a, b) => a - b);
}

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
  const recurrence = normalizeRecurrence(data.recurrence);

  return {
    ...data,
    reminderType: normalizeReminderType(data.reminderType),
    recurrence,
    // 只有每週提醒需要 weekDays，其餘一律存空陣列。
    weekDays: recurrence === "weekly" ? normalizeWeekDays(data.weekDays) : [],
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
  if (recurrence !== "daily" && recurrence !== "weekly") return null;

  const rawTime = reminder.time?.toDate ? reminder.time.toDate() : new Date(reminder.time);
  if (Number.isNaN(rawTime.getTime())) return null;

  // 每週提醒需要指定星期；沒有合法星期就無法再排程。
  const weekDays = recurrence === "weekly" ? normalizeWeekDays(reminder.weekDays) : [];
  if (recurrence === "weekly" && weekDays.length === 0) return null;

  // 逐日往後推（加整天 = +24h，台北無日光節約，當地時刻維持不變）。
  // 每週提醒額外要求台北星期落在 weekDays；上限 370 天避免無窮迴圈。
  const next = new Date(rawTime);
  for (let i = 0; i < 370; i++) {
    const matchesWeekday = recurrence === "daily" || weekDays.includes(getTaipeiWeekday(next));
    if (next > from && matchesWeekday) {
      return next;
    }
    next.setDate(next.getDate() + 1);
  }

  return null;
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
 * 建構期貨提醒訊息
 * @param {object} reminder - 提醒物件
 * @returns {Promise<string>} 提醒訊息
 */
async function buildFuturesReminderMessage(reminder) {
  const commodity = String(reminder.payload?.commodity || reminder.target || reminder.action || "").trim();
  const contract = String(reminder.payload?.contract || "").trim();

  if (!commodity) {
    return "期貨提醒設定缺少商品資訊。";
  }

  const resolved = resolveFuturesSymbol(commodity, contract);
  if (!resolved.ok) {
    return `期貨提醒\n${resolved.message}`;
  }

  const quote = await fetchYahooFuturesQuote(resolved.symbol);
  return `期貨提醒\n${buildFuturesQuoteMessage(quote, { commodity, contract })}`;
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

async function buildTopHeadlinesReminderMessage(reminder) {
  const max = Math.min(Math.max(Number(reminder.payload?.max) || 10, 1), 14);
  const headlines = await fetchTopHeadlines({ max });
  return buildTopHeadlinesMessage(headlines, { max });
}

async function buildGeneralNewsReminderMessage(reminder) {
  const query = String(reminder.payload?.query || reminder.target || "").trim();
  if (!query) {
    return "新聞提醒設定缺少查詢關鍵字。";
  }
  const max = Math.min(Math.max(Number(reminder.payload?.max) || 5, 1), 10);
  const lang = reminder.payload?.lang || "zh";
  const country = reminder.payload?.country || "tw";
  const news = await fetchNews({ query, lang, country, max });
  return `新聞提醒（${query}）\n${buildNewsMessage(news, query)}`;
}

async function buildBibleVerseReminderMessage() {
  const result = await getRandomRecoveryBibleVerse();
  return `聖經提醒\n${result.replyText}`;
}

async function buildBibleOutlineReminderMessage(reminder) {
  const bookNo = Number(reminder.payload?.bookNo);
  const bookName = String(reminder.payload?.bookName || "");
  const currentIndex = Number(reminder.payload?.currentIndex) || 0;

  if (!bookNo) throw new Error("bible_outline 提醒缺少書卷資訊");

  const readingItems = await getBookOutlineReminderItems(bookNo);
  if (!readingItems.length) throw new Error(`找不到 ${bookName} 的讀經綱目`);

  const index = currentIndex % readingItems.length;
  const item = readingItems[index];
  const content = await getOutlineItemContent(item);

  await updateReminderPayload(reminder.id, { currentIndex: currentIndex + 1 });

  const total = readingItems.length;
  return `聖經讀經提醒\n今日讀經：${bookName}（第 ${index + 1} / ${total} 段）\n${content.replyText}`;
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

    case "futures":
      return buildFuturesReminderMessage(normalized);

    case "watch_prices": {
      const result = await getWatchPrices(normalized.owner);
      return `自選股提醒\n${buildWatchPricesMessage(result.prices || [])}`;
    }

    case "today_link":
      return get_today_link();

    case "arxiv_papers":
      return buildArxivPaperReminderMessage(normalized);

    case "cnn_news":
      // 舊版 CNN 排程保留相容性，改以整合後的多來源頭條執行。
      return buildTopHeadlinesReminderMessage(normalized);

    case "top_headlines":
      return buildTopHeadlinesReminderMessage(normalized);

    case "general_news":
      return buildGeneralNewsReminderMessage(normalized);

    case "bible_verse":
      return buildBibleVerseReminderMessage();

    case "bible_outline":
      return buildBibleOutlineReminderMessage(normalized);

    case "generic":
    default:
      return `${normalized.action} 囉`;
  }
}
