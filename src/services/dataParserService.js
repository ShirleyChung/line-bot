// src/services/dataParserService.js

import OpenAI from "openai";
import { env } from "../config/env.js";

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function parseOCRToJSON(text) {
  const resp = await client.responses.create({
    model: env.OPENAI_MODEL,
    input: `
請從以下 OCR 文字中提取結構化資料，輸出 JSON：

${text}
`,
  });

  try {
    return JSON.parse(resp.output_text);
  } catch (e) {
    throw new Error("JSON parse 失敗：" + resp.output_text);
  }
}