/**
 * 工具輸出已是可直接給使用者的文字時，直接回覆而不再把結果送回模型，
 * 可省下一輪 LLM 呼叫，也避免模型改寫數字或結構化內容。
 * OpenAI 與 Gemini 兩條路徑共用此清單，新增工具時只需改這裡。
 */

// 回傳 result.text 的工具
const DIRECT_TEXT_TOOLS = new Set([
  "get_watch_prices",
  "get_stock_price",
  "get_etf_constituents",
  "get_futures_price",
  "get_itf_tournaments",
  "get_itf_tournament_details",
  "get_top_headlines",
  "summarize_article_url",
  "searchNews",
]);

// 回傳 result.replyText 的工具
const DIRECT_REPLY_TOOLS = new Set([
  "find_nearby_parking",
  "find_nearby_facilities",
  "get_house_price",
  "get_random_bible_verse",
  "get_recovery_bible_verses",
  "get_recovery_bible_outline",
  "get_recovery_bible_notes",
  "get_life_study_excerpt",
  "get_weather",
  "set_default_weather_city",
  "get_route_info",
  "find_landmarks_along_route",
  "find_facilities_along_route",
  "create_reminder",
  "list_reminders",
  "delete_reminder",
  "send_email",
]);

// 動作確認類工具：回覆只是「已完成」的確認，email 模式下也只回聊天室，
// 否則會把確認訊息寄出去（send_email 甚至會重複寄信）。
const CHAT_ONLY_TOOLS = new Set([
  "set_default_weather_city",
  "create_reminder",
  "list_reminders",
  "delete_reminder",
  "send_email",
]);

/**
 * 直接回覆時使用的 context：任一工具是動作確認類時，清掉 emailRecipient 改回聊天室。
 */
export function contextForDirectReply(toolNames, context) {
  return toolNames.some((name) => CHAT_ONLY_TOOLS.has(name))
    ? { ...context, emailRecipient: "" }
    : context;
}

/**
 * 取得工具結果中可直接回覆的文字；不適用時回傳 null。
 */
export function getDirectReplyText(toolName, result) {
  if (DIRECT_TEXT_TOOLS.has(toolName) && result?.text) return result.text;
  if (DIRECT_REPLY_TOOLS.has(toolName) && result?.replyText) return result.replyText;
  return null;
}
