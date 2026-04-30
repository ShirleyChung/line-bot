/**
 * 判斷是不是「今天連結」類命令
 * 這裡會先把空白去掉，再做比對。
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isTodayLinkCommand(text) {
  const normalized = text.replace(/\s+/g, "").toLowerCase();

  return (
    normalized === "今天連結" ||
    normalized === "今日連結" ||
    normalized === "todaylink" ||
    normalized === "link" ||
    normalized === "今天聚會連結" ||
    normalized === "今天zoom連結" ||
    normalized.includes("今天連結") ||
    normalized.includes("今天聚會連結") ||
    normalized.includes("今天zoom連結")
  );
}

/**
 * 判斷這則訊息是否有 @ 到 bot 自己
 *
 * LINE 在群組 / room 的文字訊息中，如果有提及 bot，
 * event.message.mention.mentionees 內會有對應資料，
 * 而 bot 自己通常會標示 isSelf = true。
 *
 * @param {object} event
 * @returns {boolean}
 */
export function isMentionToBot(event) {
  if (event.type !== "message") return false;
  if (event.message?.type !== "text") return false;

  const mentionees = event.message?.mention?.mentionees || [];

  return mentionees.some((m) => m.type === "user" && m.isSelf === true);
}

/**
 * 把訊息中的 @提及文字移除，避免影響命令判斷
 *
 * LINE mentionee 會提供 index / length，
 * 所以可以直接依據位置把 mention 片段切掉。
 *
 * 例如：
 * 原文：@ShirleyBot 今天連結
 * 移除後：今天連結
 *
 * @param {object} event
 * @returns {string}
 */
export function stripMentionsFromText(event) {
  const text = event.message?.text || "";
  const mentionees = event.message?.mention?.mentionees || [];

  if (!mentionees.length) {
    return text.trim();
  }

  // 先依 index 排序，避免切割順序錯亂
  const sorted = [...mentionees].sort((a, b) => a.index - b.index);

  let result = "";
  let cursor = 0;

  for (const mention of sorted) {
    const start = mention.index;
    const end = mention.index + mention.length;

    // 保留 mention 前面的文字
    result += text.slice(cursor, start);

    // 跳過 mention 本身
    cursor = end;
  }

  // 補上最後剩餘的文字
  result += text.slice(cursor);

  // 收尾時把多餘空白壓掉
  return result.replace(/\s+/g, " ").trim();
}
