/**
 * 判斷是否為「今日連結」類命令
 * 這裡會先正規化文字，再比對。
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isTodayLinkCommand(text) {
  const normalized = text.replace(/\s+/g, "").toLowerCase();

  return (
    normalized === "今日連結" ||
    normalized === "今天連結" ||
    normalized === "todaylink" ||
    normalized === "link" ||
    normalized === "今日會議連結" ||
    normalized === "今天zoom連結" ||
    normalized.includes("今日連結") ||
    normalized.includes("今日會議連結") ||
    normalized.includes("今天zoom連結")
  );
}

/**
 * 判斷是否為重置圖片批次記錄命令。
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isResetImageIdsCommand(text) {
  const normalized = text.replace(/\s+/g, "").toLowerCase();

  return (
    normalized.includes("重置圖片記錄") ||
    normalized.includes("重設圖片記錄") ||
    normalized.includes("清除圖片記錄") ||
    normalized.includes("清空圖片記錄") ||
    normalized.includes("重置圖片id") ||
    normalized.includes("清除圖片id") ||
    normalized === "重置圖片" ||
    normalized === "重設圖片" ||
    normalized === "清除圖片" ||
    normalized === "清空圖片" ||
    normalized === "resetimages" ||
    normalized === "clearimages"
  );
}

/**
 * 判斷這則訊息是否有 @ 到 bot 自己
 *
 * LINE 在群組 / room 的文字訊息中，如果有提及 bot，
 * event.message.mention.mentionees 裡會包含對應項目，
 * 且 bot 自己通常會標示 isSelf = true。
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
 * 從訊息中移除 @提及文字的部分，避免影響命令判斷
 *
 * LINE mentionee 會帶有 index / length，
 * 所以可以根據位置把 mention 從字串中移除。
 *
 * 例如：
 * 輸入：@ShirleyBot 今日連結
 * 輸出：今日連結
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

  // 依照 index 排序，避免亂序處理錯誤
  const sorted = [...mentionees].sort((a, b) => a.index - b.index);

  let result = "";
  let cursor = 0;

  for (const mention of sorted) {
    const start = mention.index;
    const end = mention.index + mention.length;

    // 保留 mention 前面的文字
    result += text.slice(cursor, start);

    // 跳過 mention 部分
    cursor = end;
  }

  // �ɤW�̫�Ѿl����r
  result += text.slice(cursor);

  // �����ɧ�h�l�ť�����
  return result.replace(/\s+/g, " ").trim();
}
