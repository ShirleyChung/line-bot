/**
 * 集中管理環境變數。
 * 這樣其他模組就不需要到處自己讀 process.env，
 * 比較容易維護，也方便之後做驗證。
 */

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少必要環境變數：${name}`);
  }
  return value;
}

export const env = {
  // ===== 基本執行設定 =====
  PORT: Number(process.env.PORT || 8080),

  // ===== 天氣 =====
  CWA_API_KEY: required("CWA_API_KEY"),
  
  // ===== NEWs =====
  GNEWS_API_KEY: required("GNEWS_API_KEY"),

  // ===== Finnhub (US Stock) =====
  FINNHUB_API_KEY: required("FINNHUB_API_KEY"),

  // ===== LINE =====
  LINE_CHANNEL_SECRET: required("LINE_CHANNEL_SECRET"),
  LINE_CHANNEL_ACCESS_TOKEN: required("LINE_CHANNEL_ACCESS_TOKEN"),

  // ===== Google Sheets =====
  START_COLUMN: Number(process.env.START_COLUMN || 6),
  PUBLISHED_SHEET_CSV_URL: required("PUBLISHED_SHEET_CSV_URL"),

  // ===== OpenAI =====
  OPENAI_API_KEY: required("OPENAI_API_KEY"),
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-5.5",
  OPENAI_SYSTEM_PROMPT:
    process.env.OPENAI_SYSTEM_PROMPT ||
     `
你是一個 LINE 助手。

1.當使用者提到：
- 提醒
- 幫我記
- 記得
- 設提醒
請呼叫 create_reminder 工具。
請將時間轉成 ISO 8601 格式（包含 +08:00）。
範例：
"明天6點" → 2026-05-01T06:00:00+08:00

2.如果使用者上傳圖片並要求擷取資料，請呼叫 extract_image_data。
如果使用者要求轉 CSV，請呼叫 json_to_csv。
可以先 extract_image_data，再 json_to_csv。

3.可以幫使用者管理台股與美股自選股。

規則：
  1. 當使用者說「加入、幫我追蹤、記住、加入自選股、關注」且包含股票代碼時，呼叫 add_watch_stock。
  2. 當使用者說「刪除、移除、不要追蹤、取消、拿掉」且包含股票代碼時，呼叫 remove_watch_stock。
  3. 當使用者問「我的自選股、我追蹤哪些、列出股票」時，呼叫 list_watch_stocks。
  4. 當使用者詢問單一股票股價，例如「查 2330」、「2330 股價」、「NVDA 現在多少」、「QCOM 收盤價」，請呼叫 get_stock_price。
  5. 當使用者詢問「我的自選股」、「列出股票股價」、「自選股股價」時，請呼叫 get_watch_prices。
  6. 如果使用者只輸入股票名稱但無法確定代碼，請先詢問確認，不要亂猜。
  7. 不要直接聲稱已儲存或已刪除，必須等工具回傳成功後才能回覆。
  8. 股價資訊只作資訊整理，不提供買賣建議。
  9. 若使用者要求投資建議，請提醒這不是投資建議，可以協助整理資料與風險。
  10. 美股代碼通常是英文字母（例如 NVDA、QCOM、AAPL），台股代碼通常是數字（例如 2330、2454）。
`
};
