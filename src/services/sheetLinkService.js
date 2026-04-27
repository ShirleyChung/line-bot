/**
 * 這個版本不使用 Google Sheets API，也不需要 GOOGLE_SERVICE_ACCOUNT_JSON。
 *
 * 前提：
 * 1. Google Sheet 分頁可公開匯出 CSV
 * 2. Cloud Run 環境變數已設定 PUBLISHED_SHEET_CSV_URL
 */

import { env } from "../config/env.js";
import {
  parseDateRangeText,
  isMonthDayInRange,
  calcOffsetFromStart,
} from "../utils/dateRange.js";
import { isUrl } from "../utils/format.js";

/**
 * 抓取今天對應的連結
 * @returns {Promise<string|null>}
 */
export async function getTodayLinkFromSheet() {
  const csvText = await fetchPublishedCsv(env.PUBLISHED_SHEET_CSV_URL);
  const rows = parseCsv(csvText);

  if (!rows.length) {
    throw new Error("公開 CSV 沒有資料");
  }

  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  // 由下往上掃，延續你原本 GAS 的邏輯
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const text = (row[0] || "").trim(); // A 欄

    const rangeInfo = parseDateRangeText(text);
    if (!rangeInfo) {
      continue;
    }

    // 判斷今天是否落在日期區間內
    if (
      isMonthDayInRange(
        todayMonth,
        todayDay,
        rangeInfo.startMonth,
        rangeInfo.startDay,
        rangeInfo.endMonth,
        rangeInfo.endDay
      )
    ) {
      // 計算今天距離起始日的 offset，F 欄起算
      const offset = calcOffsetFromStart(
        todayMonth,
        todayDay,
        rangeInfo.startMonth,
        rangeInfo.startDay
      );

      // START_COLUMN 是 1-based；row index 是 0-based
      const targetColIndex = env.START_COLUMN - 1 + offset;
      const value = (row[targetColIndex] || "").trim();

      if (!value) {
        throw new Error("已找到今天對應欄位，但內容為空");
      }

      if (isUrl(value)) {
        return value;
      }

      throw new Error(`已找到今天對應欄位，但不是可辨識的 URL：${value}`);
    }
  }

  return null;
}

/**
 * 抓取公開 CSV
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchPublishedCsv(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`下載公開 CSV 失敗，HTTP ${response.status}`);
  }

  return await response.text();
}

/**
 * 解析 CSV 文字成二維陣列
 * 支援雙引號、逗號、換行
 * @param {string} text
 * @returns {string[][]}
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (ch === "\r") {
        // 忽略 Windows CR
      } else {
        cell += ch;
      }
    }
  }

  row.push(cell);

  const hasAnyValue = row.some((v) => v !== "") || rows.length === 0;
  if (hasAnyValue) {
    rows.push(row);
  }

  return rows;
}
