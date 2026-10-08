/**
 * 將內部錯誤轉成可以直接回覆給使用者的訊息。
 * 只辨識常見且使用者需要知道原因的情況（LLM 額度不足、請求過多），
 * 其餘一律回傳通用訊息，避免把內部錯誤細節外洩給使用者。
 * @param {unknown} error - 捕捉到的錯誤
 * @returns {string} 使用者可讀的錯誤訊息
 */
export function toUserFacingErrorMessage(error) {
  const status = error?.status;
  const code = String(error?.code || error?.error?.code || "");
  const message = String(error?.message || "");

  // OpenAI：429 + insufficient_quota；Gemini：429 + RESOURCE_EXHAUSTED（含免費額度用完）
  if (code === "insufficient_quota" || /insufficient_quota|exceeded your current quota/i.test(message)) {
    return "AI 服務額度已用完，暫時無法回覆，請通知管理員處理。";
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|rate limit/i.test(message)) {
    return "AI 服務目前忙碌或已達使用上限，請稍後再試。";
  }

  return "處理訊息時發生錯誤，請稍後再試。";
}
