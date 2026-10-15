import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { botTools } from "../llm/tools.js";
import { executeTool } from "../llm/toolDispatcher.js";
import { contextForDirectReply, getDirectReplyText } from "../llm/directReplyTools.js";
import { normalizeEmailRecipients } from "../utils/emailRecipients.js";
import { sendEmail } from "./emailService.js";
import { getUserMemory } from "./userMemoryService.js";
import { guardLlmCall } from "./llmCircuitBreaker.js";
import {
  buildSessionKey,
  getConversationState,
  setGeminiConversationState,
} from "./conversationStateService.js";

export function buildGeminiFunctionDeclarations(tools = botTools) {
  return tools.map(({ type: _type, strict: _strict, parameters, ...tool }) => {
    const parametersJsonSchema = structuredClone(parameters);
    // OpenAI strict mode 要求所有欄位均 required；Gemini 不需要。提醒工具若強迫模型
    // 一次填滿十多個無關空欄位，容易不呼叫工具或產生無效參數。
    if (tool.name === "create_reminder") {
      parametersJsonSchema.required = ["time", "recurrence", "reminderType"];
    }
    return { ...tool, parametersJsonSchema };
  });
}

const geminiTools = [{ functionDeclarations: buildGeminiFunctionDeclarations() }];

function taipeiIsoNow() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date()).replace(" ", "T") + "+08:00";
}

async function buildInstructions(sessionKey, context) {
  let instructions = env.OPENAI_SYSTEM_PROMPT;
  const memory = await getUserMemory(sessionKey);
  if (memory) {
    instructions += `\n(以下是這位使用者的偏好與背景：\n${JSON.stringify(memory, null, 2)}\n請依照這些偏好回覆。)`;
  }
  instructions += `\n(目前時間（Asia/Taipei）是：${taipeiIsoNow()}。相對時間請以此為基準；reminder 工具時間使用含 +08:00 的 ISO 8601。)`;
  if (context.imageIds?.length) {
    instructions += `\n（系統資訊：使用者最近上傳過 ${context.imageIds.length} 張圖片。若要求 OCR 或擷取圖片資料，請呼叫 extract_image_data，不要要求重新上傳。）`;
  }
  return instructions;
}

function trimHistory(history) {
  const configuredMax = Math.max(2, env.GEMINI_HISTORY_MAX_MESSAGES || 12);
  // 每輪固定由 user/model 兩筆組成，強制使用偶數避免裁切後以 model 開頭。
  const maxMessages = Math.floor(configuredMax / 2) * 2;
  let trimmed = history.slice(-maxMessages);
  // Firestore 單文件上限為 1 MiB；對話狀態保守控制在約 200 KiB 以內。
  while (trimmed.length > 2 && Buffer.byteLength(JSON.stringify(trimmed), "utf8") > 200_000) {
    trimmed = trimmed.slice(2);
  }
  return trimmed;
}

async function saveTextTurn(sessionKey, priorHistory, userText, modelText) {
  const nextHistory = trimHistory([
    ...priorHistory,
    { role: "user", parts: [{ text: userText }] },
    { role: "model", parts: [{ text: modelText }] },
  ]);
  await setGeminiConversationState(sessionKey, nextHistory);
}

async function deliverDirectResult(text, userText, context) {
  const recipient = normalizeEmailRecipients(context.emailRecipient);
  if (!recipient) return { type: "text", text };
  const subject = String(context.emailSubject || context.originalUserText || userText || "查詢結果")
    .trim().slice(0, 200) || "查詢結果";
  await sendEmail({ to: recipient, subject, body: text });
  return { type: "text", text: `已寄到 ${recipient}`, emailed: true };
}

function responseText(response) {
  return (response?.text || response?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "").join("") || "").trim();
}

export async function askGeminiWithTools(userText, context = {}) {
  if (!env.GEMINI_API_KEY) {
    return { type: "text", text: "目前尚未設定 Gemini API Key，無法使用 LLM 功能。" };
  }

  const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const sessionKey = buildSessionKey(context.source);
  const savedState = await getConversationState(sessionKey);
  const priorHistory = Array.isArray(savedState?.geminiHistory)
    ? trimHistory(savedState.geminiHistory)
    : [];
  const contents = [...priorHistory, { role: "user", parts: [{ text: userText }] }];
  const config = {
    systemInstruction: await buildInstructions(sessionKey, context),
    maxOutputTokens: env.GEMINI_MAX_OUTPUT_TOKENS,
    tools: geminiTools,
  };
  if (/^gemini-2\.5-flash(?:-|$)/.test(env.GEMINI_MODEL)) {
    // maxOutputTokens 也包含 thinking tokens；動態思考可能耗盡 1500 token，導致沒有
    // function call。提醒與查詢路由不需深度推理，關閉 thinking 可避免這個問題。
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  let response = await guardLlmCall(() => client.models.generateContent({
    model: env.GEMINI_MODEL,
    contents,
    config,
  }));

  // 每多一輪就多一次 LLM 呼叫；與 OpenAI 路徑同樣限制為 3 輪。
  for (let round = 0; round < 3; round++) {
    const modelContent = response?.candidates?.[0]?.content;
    const functionCalls = (modelContent?.parts || [])
      .filter((part) => part.functionCall)
      .map((part) => part.functionCall);

    if (!functionCalls.length) {
      const text = responseText(response) || "我暫時無法產生回覆。";
      await saveTextTurn(sessionKey, priorHistory, userText, text);
      return { type: "text", text, toolUsed: round > 0 };
    }

    contents.push(modelContent);
    const responseParts = [];
    const directTexts = [];
    for (const call of functionCalls) {
      let result;
      try {
        result = await executeTool(call.name, call.args || {}, context);
      } catch (error) {
        return { type: "text", text: error?.message || String(error) || "工具執行失敗", toolUsed: true };
      }

      if (result?.ok === false || result?.error) {
        return {
          type: "text",
          text: result?.replyText || result?.message || result?.error || "工具執行失敗",
          toolUsed: true,
        };
      }
      const directText = getDirectReplyText(call.name, result);
      if (directText) directTexts.push(directText);

      responseParts.push({
        functionResponse: {
          id: call.id,
          name: call.name,
          response: { result },
        },
      });
    }

    // 所有工具都已產生可直接回覆的文字時，合併回覆，不再呼叫模型。
    if (directTexts.length && directTexts.length === functionCalls.length) {
      return deliverDirectResult(
        directTexts.join("\n\n"),
        userText,
        contextForDirectReply(functionCalls.map((c) => c.name), context),
      );
    }

    contents.push({ role: "user", parts: responseParts });
    response = await guardLlmCall(() =>
      client.models.generateContent({ model: env.GEMINI_MODEL, contents, config })
    );
  }

  return { type: "text", text: "工具處理次數過多，已停止。", toolUsed: true };
}
