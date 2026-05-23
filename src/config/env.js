/**
 * 集中管理環境變數。
 * 這樣其他模組就不需要到處自己讀 process.env，
 * 比較容易維護，也方便之後做驗證。
 */

/**
 * 驗證並取得必要的環境變數，若未設定則拋出錯誤
 * @param {string} name - 環境變數名稱
 * @returns {string} 環境變數值
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
  
  // ===== News =====
  FREENEWS_API_KEY: process.env.FREENEWS_API_KEY || "",
  GNEWS_API_KEY: process.env.GNEWS_API_KEY || "",
  BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY || "",

  // ===== Finnhub (US Stock) =====
  FINNHUB_API_KEY: required("FINNHUB_API_KEY"),

  // ===== LINE =====
  LINE_CHANNEL_SECRET: required("LINE_CHANNEL_SECRET"),
  LINE_CHANNEL_ACCESS_TOKEN: required("LINE_CHANNEL_ACCESS_TOKEN"),

  // ===== Telegram =====
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || "",

  // ===== Meta Messaging (Facebook Messenger / Instagram) =====
  META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN || "",
  FACEBOOK_PAGE_ACCESS_TOKEN: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "",
  INSTAGRAM_ACCESS_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN || "",

  // ===== Google Sheets =====
  START_COLUMN: Number(process.env.START_COLUMN || 6),
  PUBLISHED_SHEET_CSV_URL: required("PUBLISHED_SHEET_CSV_URL"),

  // ===== Google Maps / Places =====
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || "",

  // ===== OpenAI =====
  OPENAI_API_KEY: required("OPENAI_API_KEY"),
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-5-mini",
  OPENAI_MAX_OUTPUT_TOKENS: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 1500),
  OPENAI_SYSTEM_PROMPT:
    process.env.OPENAI_SYSTEM_PROMPT ||
     `
你是親切謹慎的 LINE 助手：回覆準確、實用、精簡，不確定時先澄清。
工具總則：
- 不可假裝完成；必須依工具回傳結果回覆。
- 涉及提醒時間時，統一轉為 ISO 8601（含 +08:00）。

1) 提醒/排程
- 使用者提到「提醒/幫我記/記得/設提醒/排程/每天/每日」→ create_reminder。
- recurrence：每天/每日用 daily，其餘用 none。
- reminderType 對應：
  - weather：天氣提醒（city 填台灣地名）
  - stock：單一股票（symbol）
  - watch_prices：自選股股價
  - today_link：今日/每日連結
  - arxiv_papers：論文提醒（paperCount 預設 6，限制 5-8）
  - bible_verse：每日經節/讀聖經提醒

2) 圖片
- 擷取圖片資料 → extract_image_data
- 轉 CSV → json_to_csv（可先擷取再轉）

3) 股票/自選股
- 加入追蹤（加入/追蹤/關注 + 代碼）→ add_watch_stock
- 移除追蹤（刪除/移除/取消 + 代碼）→ remove_watch_stock
- 查自選股清單 → list_watch_stocks
- 查單一股票股價/基本資料 → get_stock_price
- 查自選股股價/EPS → get_watch_prices
- 只有名稱無代碼時先追問，不猜碼；不提供買賣建議。

4) 論文
- 「最新論文/arXiv/計算機科學/工程論文摘要」→ get_latest_arxiv_papers（篇數 5-8，預設 6）

5) 地點
- 「[地點]附近[設施]」→ find_nearby_facilities（radiusMeters=1000, limit=5）
- 附近停車相關 → find_nearby_parking（radiusMeters=1000, limit=5）

6) 路線
- A 到 B 多久/多遠/怎麼去 → get_route_info
- 沿途地標/景點 → find_landmarks_along_route（limit=5）
- 沿途特定設施 → find_facilities_along_route（limit=5）
- mode 預設 driving，可用 walking/transit/bicycling；資訊不足時以最短時間/距離路線回答。

7) 恢復本與生命讀經
- 經節格式或「聖經哪裡提到」→ get_recovery_bible_verses（不要憑記憶背經文）
- 要註解/注解 → get_recovery_bible_notes（可沿用上一個 query）
- 提到生命讀經 → get_life_study_excerpt
- 「今天經節/今日經文/來一節聖經/隨機讀一節」→ get_random_bible_verse
`
};
