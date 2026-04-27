/**
 * 這個 handler 專門處理「今天連結」類型的命令。
 * 它只負責協調：
 * 1. 叫 service 查今天連結
 * 2. 組裝要回給 LINE 的訊息
 * 3. 呼叫 replyText
 */

import { getTodayLinkFromSheet } from "../services/sheetLinkService.js";
import { replyText } from "../line/reply.js";
import { formatMonthDay } from "../utils/format.js";

/**
 * 處理今天連結命令
 * @param {object} event - LINE webhook event
 */
export async function handleTodayLink(event) {
  const url = await getTodayLinkFromSheet();
  const todayStr = formatMonthDay(new Date());

  const message = url
    ? `通知：今晚 9:45
今天（${todayStr}）的連結如下：
${url}

線上聯結：https://us06web.zoom.us/j/87317139779?pwd=0oJsbadeBpeCOc2RUYQscgLjbTIbcd.1
會議ID：873 1713 9779
密碼：707070`
    : `今天（${todayStr}）找不到對應連結。`;

  return replyText(event.replyToken, message);
}
