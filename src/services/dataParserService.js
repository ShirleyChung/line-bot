// src/services/dataParserService.js

import OpenAI from "openai";
import { env } from "../config/env.js";

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

/**
 * 將 OCR 純文字交給 LLM 整理成 JSON。
 * 這層只負責結構化，圖片下載與 OCR 由 imageService / ocrService 處理。
 */
export async function parseOCRToJSON(text) {
  const resp = await client.responses.create({
    model: env.OPENAI_MODEL,
    max_output_tokens: env.OPENAI_MAX_OUTPUT_TOKENS,
    input: `
請從以下 OCR 文字中提取結構化資料，輸出 JSON：

${text}
`,
  });

  try {
    return JSON.parse(resp.output_text);
  } catch (e) {
    // 保留模型原始輸出，方便回頭調整 prompt 或排查格式錯誤。
    throw new Error("JSON parse 失敗：" + resp.output_text);
  }
}
