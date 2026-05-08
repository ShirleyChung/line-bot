import { lineBlobClient } from "../line/client.js";

/**
 * 從 LINE messageId 下載使用者上傳的圖片內容。
 * LINE SDK 回傳的是 stream，這裡統一轉成 Buffer 給 OCR service 使用。
 */
export async function fetchImageBuffer(messageId) {
  const stream = await lineBlobClient.getMessageContent(messageId);

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
