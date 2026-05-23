import { replyText } from "../platform/reply.js";
import { getRandomRecoveryBibleVerse } from "../services/recoveryBibleService.js";

/**
 * 處理「今天經節 / 今日經文」命令
 * @param {object} event - 平台 webhook event
 */
export async function handleTodayBibleVerse(event) {
  const result = await getRandomRecoveryBibleVerse();
  return replyText(event, result.replyText);
}
