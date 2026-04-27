/**
 * 這個檔案專門處理回覆 LINE 訊息。
 * 好處是未來如果你想加 rich message、flex message、圖片訊息，
 * 只要在這裡擴充即可。
 */

import { lineClient } from "./client.js";

/**
 * 回覆純文字訊息
 * @param {string} replyToken - LINE webhook event 內的 replyToken
 * @param {string} text - 要回覆的文字
 */
export async function replyText(replyToken, text) {
  return lineClient.replyMessage({
    replyToken,
    messages: [
      {
        type: "text",
        text,
      },
    ],
  });
}
