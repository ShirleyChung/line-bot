/**
 * 這裡負責：
 * 1. 呼叫 OpenAI Responses API
 * 2. 把 tools 定義傳給模型
 * 3. 如果模型要求呼叫工具，就執行工具
 * 4. 再把工具結果回送給模型，讓模型產生最後回答
 */

import OpenAI from "openai";
import { env } from "../config/env.js";
import { botTools } from "../llm/tools.js";
import { executeTool } from "../llm/toolDispatcher.js";
import { getUserMemory } from "./userMemoryService.js";
import {
  buildSessionKey,
  getConversationState,
  setConversationState,
} from "./conversationStateService.js";

// 初始化 OpenAI client
const client = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/**
 * 使用 LLM + tools 處理使用者輸入
 *
 * @param {string} userText - 使用者輸入
 * @param {object} context - 可傳入 replyToken、source、userId 等上下文
 * @returns {Promise<{type:string,text?:string,toolUsed?:boolean}>}
 */
export async function askLlmWithTools(userText, context = {}) {
  // 如果尚未設定 OpenAI key，直接回固定訊息，避免整個流程失敗
  if (!env.OPENAI_API_KEY) {
    return {
      type: "text",
      text: "目前尚未設定 OpenAI API Key，無法使用 LLM 功能。",
    };
  }
  const sessionKey = buildSessionKey(context.source);
  const savedState = await getConversationState(sessionKey);
  const memory = await getUserMemory(sessionKey);
  let instructions = env.OPENAI_SYSTEM_PROMPT;
  if (memory) {
    instructions += `
  (以下是這位使用者的偏好與背景：
  ${JSON.stringify(memory, null, 2)}
  請依照這些偏好回覆。)`;
  }
  const now = new Date();
  const taipeiNow =
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now).replace(" ", "T") + "+08:00";
  instructions += `
  (目前時間（Asia/Taipei）是：${taipeiNow}。
  當使用者提到相對或自然語言時間時，例如「5分鐘後」「10分鐘後」「1小時後」「今晚9:10」「明天早上8點」「下週三下午3點」，
  請以這個時間為基準進行推算。如果使用者提供的時間資訊已足夠，就不要再要求精確時間。
  如果要呼叫 reminder 相關工具，時間一律輸出為 ISO 8601 格式，並包含 +08:00。)
  `;
  if (context.imageIds?.length) {
  instructions += `
  （系統資訊：使用者最近上傳過 ${context.imageIds.length} 張圖片，目前可供工具作為同一批圖片使用。
  如果使用者要求「從圖片取資料」、「OCR」、「讀取圖片內容」、「擷取圖片資料」、「處理這批圖片」，
  請優先呼叫 extract_image_data 工具，不要要求再次上傳圖片。）
  `;
  }
  let response = await client.responses.create({
    model: env.OPENAI_MODEL,
    instructions: instructions,
    input: userText,
    previous_response_id: savedState?.lastResponseId || undefined,
    tools: botTools,
  });

  // 最多允許幾輪工具呼叫，避免模型陷入無限循環
  for (let round = 0; round < 5; round++) {
    const functionCalls = (response.output || []).filter(
      (item) => item.type === "function_call"
    );

    // 如果模型沒有要求工具呼叫，直接回一般文字
    if (!functionCalls.length) {
      // 保存最新 response.id，供下一輪延續上下文
      if (response?.id) {
        setConversationState(sessionKey, response.id);
      }

      return {
        type: "text",
        text: response.output_text?.trim() || "我暫時無法產生回覆。",
        toolUsed: round > 0,
      };
    }

    // 逐一執行模型要求的工具
    const toolOutputs = [];

    for (const call of functionCalls) {
      const args = JSON.parse(call.arguments || "{}");
      const result = await executeTool(call.name, args, context);
      // 已經格式化好的 LINE 文字，直接回覆，不再交給 LLM 重排
    if (["get_watch_prices", "get_stock_price"].includes(call.name) && result?.text) {
      return {
        type: "text",
        text: result.text,
      };
    }
    toolOutputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
      console.log(
        "[askLlmWithTools] functionCalls =",
        functionCalls.map((c) => ({
          name: c.name,
          arguments: c.arguments,
        }))
      );
    }

    // 把工具執行結果再送回模型，讓模型產生下一步或最終回答
    response = await client.responses.create({
      model: env.OPENAI_MODEL,
      previous_response_id: response.id,
      input: toolOutputs,
      tools: botTools,
    });
  }
  // 即使超過迴圈，也盡量保存最後一次 response.id
  if (response?.id) {
    await setConversationState(sessionKey, response.id);
  }

  return {
    type: "text",
    text: "工具處理次數過多，已停止。",
    toolUsed: true,
  };
}
