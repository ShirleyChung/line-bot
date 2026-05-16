// src/services/csvService.js

/**
 * 將單筆物件依指定欄位順序轉成 CSV。
 * 目前只處理單列資料；多列資料的 CSV 轉換由 toolDispatcher 內的 rowsToCSV 處理。
 * @param {object} data - 資料物件
 * @param {Array<string>} fields - 欄位名稱陣列
 * @returns {string} CSV 字串
 */
export function jsonToCSV(data, fields) {
  const header = fields.join(",");
  const row = fields.map((f) => data[f] ?? "").join(",");

  return `${header}\n${row}`;
}
