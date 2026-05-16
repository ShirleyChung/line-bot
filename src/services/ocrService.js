// src/services/ocrService.js

import vision from "@google-cloud/vision";

const client = new vision.ImageAnnotatorClient();

/**
 * 使用 Google Cloud Vision 做文字偵測。
 * 回傳完整文字，後續再由 dataParserService 轉成結構化資料。
 * @param {Buffer} buffer - 圖片內容 Buffer
 * @returns {Promise<string>} OCR 辨識的文字
 */
export async function ocrImage(buffer) {
  const [result] = await client.textDetection({
    image: { content: buffer },
  });

  return result.fullTextAnnotation?.text || "";
}
