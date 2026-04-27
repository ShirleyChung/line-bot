/**
 * 與 Google Sheet 儲存格內容解析有關的小工具。
 * 這裡把從 HYPERLINK 公式抽網址、欄號轉字母等功能獨立出來。
 */

/**
 * 從 HYPERLINK 公式中抽出網址
 * 例如：=HYPERLINK("https://example.com","文字")
 * @param {string} formula
 * @returns {string|null}
 */
export function extractUrlFromFormula(formula) {
  const m = formula.match(/HYPERLINK\("([^"]+)"/i);
  return m ? m[1] : null;
}

/**
 * 將欄號轉成 Excel/Sheet 欄名字母
 * 例如 1 -> A, 6 -> F, 27 -> AA
 * @param {number} column
 * @returns {string}
 */
export function columnToLetter(column) {
  let temp = "";
  let letter = "";

  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }

  return letter;
}
