/**
 * 這裡放一些格式化相關的小工具
 */

/**
 * 將日期格式化成 M/D
 * @param {Date} date
 * @returns {string}
 */
export function formatMonthDay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 判斷是否為 URL 字串
 * @param {string} text
 * @returns {boolean}
 */
export function isUrl(text) {
  return /^https?:\/\/\S+$/i.test(text);
}
