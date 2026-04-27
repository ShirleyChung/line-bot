/**
 * 這個 service 專門呼叫 OpenAI。
 * 這裡使用官方 JavaScript SDK 與 Responses API。
 * OpenAI 官方文件指出，新專案建議優先使用 Responses API。:contentReference[oaicite:4]{index=4}
 */

import OpenAI from "openai";
import { env } from "../config/env.js";

// 初始化 OpenAI client
const client = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/**
 * 呼叫 LLM 取得回覆文字
 * @param {string} userText - 使用者輸入
 * @returns {Promise<string>}
 */
export async function askLlm(userText) {
  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    instructions: env.OPENAI_SYSTEM_PROMPT,
    input: userText,
  });

  const output = response.output_text?.trim();

  if (!output) {
    return "我暫時無法產生回覆，請稍後再試。";
  }

  return output;
}
