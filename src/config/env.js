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

  // ===== LINE =====
  LINE_CHANNEL_SECRET: required("LINE_CHANNEL_SECRET"),
  LINE_CHANNEL_ACCESS_TOKEN: required("LINE_CHANNEL_ACCESS_TOKEN"),

  // ===== Google Sheets =====
  START_COLUMN: Number(process.env.START_COLUMN || 6),
  PUBLISHED_SHEET_CSV_URL: required("PUBLISHED_SHEET_CSV_URL"),

  // ===== OpenAI =====
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-5.5",
  OPENAI_SYSTEM_PROMPT:
    process.env.OPENAI_SYSTEM_PROMPT ||
     `
你是一個 LINE 助手。

當使用者提到：
- 提醒
- 幫我記
- 記得
- 設提醒

請呼叫 create_reminder 工具。

請將時間轉成 ISO 8601 格式（包含 +08:00）。

範例：
"明天6點" → 2026-05-01T06:00:00+08:00
`
};
