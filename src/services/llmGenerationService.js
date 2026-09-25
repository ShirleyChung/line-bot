import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { createResponseWithUsage } from "./openaiResponseService.js";

let openaiClient;
let geminiClient;

function getOpenAiClient() {
  if (!env.OPENAI_API_KEY) throw new Error("目前尚未設定 OpenAI API Key");
  openaiClient ||= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return openaiClient;
}

function getGeminiClient() {
  if (!env.GEMINI_API_KEY) throw new Error("目前尚未設定 Gemini API Key");
  geminiClient ||= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return geminiClient;
}

export function hasConfiguredLlm() {
  return env.LLM_PROVIDER === "gemini" ? Boolean(env.GEMINI_API_KEY) : Boolean(env.OPENAI_API_KEY);
}

function logGeminiUsage(response, purpose, startedAt) {
  const usage = response?.usageMetadata || {};
  console.log(JSON.stringify({
    severity: "INFO",
    message: "Gemini API usage",
    event: "gemini_generate_content_usage",
    purpose,
    model: env.GEMINI_MODEL,
    duration_ms: Date.now() - startedAt,
    input_tokens: usage.promptTokenCount ?? null,
    output_tokens: usage.candidatesTokenCount ?? null,
    thinking_tokens: usage.thoughtsTokenCount ?? null,
    total_tokens: usage.totalTokenCount ?? null,
    usage,
  }));
}

/**
 * 提供摘要、OCR 結構化等非對話型工作共用的 LLM 介面。
 * 回傳 OpenAI 相容的 output_text，讓既有呼叫端不必依供應商分支。
 */
export async function createLlmTextResponse({
  purpose,
  instructions = "",
  input,
  maxOutputTokens,
  jsonSchema,
  jsonSchemaName = "response",
  reasoningEffort,
}) {
  if (env.LLM_PROVIDER === "openai") {
    const params = {
      model: env.OPENAI_MODEL,
      max_output_tokens: maxOutputTokens,
      instructions,
      input,
    };
    if (reasoningEffort) params.reasoning = { effort: reasoningEffort };
    if (jsonSchema) {
      params.text = {
        format: {
          type: "json_schema",
          name: jsonSchemaName,
          strict: true,
          schema: jsonSchema,
        },
      };
    }
    return createResponseWithUsage(getOpenAiClient(), params, { purpose });
  }

  if (env.LLM_PROVIDER !== "gemini") {
    throw new Error(`不支援的 LLM_PROVIDER：${env.LLM_PROVIDER}`);
  }

  const config = {
    systemInstruction: instructions || undefined,
    maxOutputTokens,
  };
  if (jsonSchema) {
    config.responseMimeType = "application/json";
    config.responseJsonSchema = jsonSchema;
  }
  // 2.5 Flash 預設會動態思考，可能在較小輸出上限內耗完 token 而沒有可見文字。
  // 摘要、翻譯與資料整理不需要推理，明確關閉可提高穩定性並降低費用。
  if (/^gemini-2\.5-flash(?:-|$)/.test(env.GEMINI_MODEL)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  const startedAt = Date.now();
  const response = await getGeminiClient().models.generateContent({
    model: env.GEMINI_MODEL,
    contents: input,
    config,
  });
  logGeminiUsage(response, purpose, startedAt);
  return {
    output_text: String(response?.text || ""),
    status: response?.candidates?.[0]?.finishReason || null,
    usage: response?.usageMetadata || {},
    provider: "gemini",
    raw: response,
  };
}
