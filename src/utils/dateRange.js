/**
 * 這裡放日期區間相關工具函式。
 * 這些邏輯是從你原本的 GAS 版本抽出來的，
 * 適合獨立成共用工具。
 */

/**
 * 解析像 4/17~4/23、4/17-4/23、4/17～4/23 這種字串
 * @param {string} text
 * @returns {null | {startMonth:number,startDay:number,endMonth:number,endDay:number}}
 */
export function parseDateRangeText(text) {
  const m = text.match(
    /(\d{1,2})\/(\d{1,2})\s*[~～\-－]\s*(\d{1,2})\/(\d{1,2})/
  );

  if (!m) return null;

  return {
    startMonth: parseInt(m[1], 10),
    startDay: parseInt(m[2], 10),
    endMonth: parseInt(m[3], 10),
    endDay: parseInt(m[4], 10),
  };
}

/**
 * 判斷指定月日是否落在區間內
 * 目前沿用你原本假設：同一年內、不跨年
 * @param {number} month
 * @param {number} day
 * @param {number} startMonth
 * @param {number} startDay
 * @param {number} endMonth
 * @param {number} endDay
 * @returns {boolean}
 */
export function isMonthDayInRange(
  month,
  day,
  startMonth,
  startDay,
  endMonth,
  endDay
) {
  const target = month * 100 + day;
  const start = startMonth * 100 + startDay;
  const end = endMonth * 100 + endDay;

  return target >= start && target <= end;
}

/**
 * 計算今天距離區間起始日的天數 offset
 * 例如起始是 4/17，今天是 4/21，則回傳 4
 * @param {number} month
 * @param {number} day
 * @param {number} startMonth
 * @param {number} startDay
 * @returns {number}
 */
export function calcOffsetFromStart(month, day, startMonth, startDay) {
  const year = new Date().getFullYear();

  const startDate = new Date(year, startMonth - 1, startDay);
  const targetDate = new Date(year, month - 1, day);

  const diffMs = targetDate.getTime() - startDate.getTime();

  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}
