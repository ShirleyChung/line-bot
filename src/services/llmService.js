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
import { sendEmail } from "./emailService.js";
import { normalizeEmailRecipients } from "../utils/emailRecipients.js";
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

function countUnclosedObjectBraces(jsonText) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const char of jsonText) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth++;
    if (char === "}") depth--;
  }

  return inString || depth < 0 ? null : depth;
}

function parseToolArguments(argumentsText) {
  const raw = argumentsText || "{}";

  try {
    return {
      args: JSON.parse(raw),
      repaired: false,
    };
  } catch (originalError) {
    // Responses API strict tools should produce JSON, but models can occasionally
    // emit a valid object followed by CR/LF noise or omit only the final "}".
    const sanitized = raw.replace(/[\s\u0000-\u001f]+$/u, "");
    const unclosedObjectBraces = countUnclosedObjectBraces(sanitized);
    const candidates = [];

    if (sanitized && sanitized !== raw) {
      candidates.push(sanitized);
    }
    if (
      sanitized.startsWith("{") &&
      unclosedObjectBraces &&
      unclosedObjectBraces > 0
    ) {
      candidates.push(`${sanitized}${"}".repeat(unclosedObjectBraces)}`);
    }

    for (const candidate of candidates) {
      try {
        return {
          args: JSON.parse(candidate),
          repaired: true,
        };
      } catch {
        // Keep trying narrower repairs; if all fail, surface original parse error.
      }
    }

    throw originalError;
  }
}

async function deliverDirectResult(text, userText, context = {}) {
  const emailRecipient = normalizeEmailRecipients(context.emailRecipient);
  if (!emailRecipient) {
    return {
      type: "text",
      text,
    };
  }

  const subject = String(context.emailSubject || context.originalUserText || userText || "查詢結果")
    .trim()
    .slice(0, 200);

  await sendEmail({
    to: emailRecipient,
    subject: subject || "查詢結果",
    body: text,
  });

  return {
    type: "text",
    text: `已寄到 ${emailRecipient}`,
    emailed: true,
  };
}

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
    // 使用者記憶只作為系統提示補充，不直接改動原始 userText。
    instructions += `
  (以下是這位使用者的偏好與背景：
  ${JSON.stringify(memory, null, 2)}
  請依照這些偏好回覆。)`;
  }
  const now = new Date();
  // 以台北時間提供給模型，讓「明天早上」「5 分鐘後」這類相對時間有穩定基準。
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
  如果要呼叫 reminder 相關工具，時間一律輸出為 ISO 8601 格式，並包含 +08:00。
  +08:00 代表 Asia/Taipei 的當地時間，不要先換算成 UTC 再把同一個時刻寫回 +08:00。
  例如「今天下午 2 點」要寫成 14:00:00+08:00，不是 06:00:00+08:00。
  如果是 daily 提醒且該時刻今天已過，請改成下一次會發生的日期與時間。)
  `;
  if (context.imageIds?.length) {
  // 有圖片批次時主動告知模型可呼叫 OCR 工具，減少模型要求使用者重傳圖片的機率。
  instructions += `
  （系統資訊：使用者最近上傳過 ${context.imageIds.length} 張圖片，目前可供工具作為同一批圖片使用。
  如果使用者要求「從圖片取資料」、「OCR」、「讀取圖片內容」、「擷取圖片資料」、「處理這批圖片」，
  請優先呼叫 extract_image_data 工具，不要要求再次上傳圖片。）
  `;
  }
  let response = await client.responses.create({
    model: env.OPENAI_MODEL,
    max_output_tokens: env.OPENAI_MAX_OUTPUT_TOKENS,
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
      let args = {};
      try {
        const parsed = parseToolArguments(call.arguments);
        args = parsed.args;
        if (parsed.repaired) {
          console.warn("[askLlmWithTools] 已修復工具參數 JSON 尾端格式", {
            name: call.name,
            arguments: call.arguments,
            parsedArgs: args,
          });
        }
      } catch (error) {
        // 模型（尤其 mini 等級）偶爾會產生格式錯誤的工具參數 JSON，
        // 最常見是字串值內含未跳脫的雙引號或換行（例如新聞排程的 newsQuery/action）。
        // 與其直接中斷整個請求，把錯誤回饋給模型，讓它在剩餘輪次重新產生正確的參數。
        console.warn("[askLlmWithTools] 工具參數 JSON 解析失敗", {
          name: call.name,
          message: error?.message || String(error),
          arguments: call.arguments,
        });
        toolOutputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({
            ok: false,
            error: `參數 JSON 格式錯誤：${error?.message || String(error)}。請重新呼叫這個工具，並產生格式正確的 JSON；字串值內的雙引號與換行請正確跳脫。`,
          }),
        });
        continue;
      }

      let result;
      try {
        result = await executeTool(call.name, args, context);
      } catch (error) {
        return {
          type: "text",
          text: error?.message || String(error) || "工具執行失敗",
          toolUsed: true,
        };
      }

      if (result?.ok === false || result?.error) {
        return {
          type: "text",
          text: result?.replyText || result?.message || result?.error || "工具執行失敗",
          toolUsed: true,
        };
      }
      // 已經格式化好的工具結果，若有 emailRecipient 則直接寄送；否則回聊天室。
      if (["get_watch_prices", "get_stock_price", "get_etf_constituents", "get_futures_price", "get_latest_arxiv_papers", "get_itf_tournaments", "get_itf_tournament_details", "get_top_headlines", "summarize_article_url"].includes(call.name) && result?.text) {
        return deliverDirectResult(result.text, userText, context);
      }
      if (
        [
          "find_nearby_parking",
          "find_nearby_facilities",
          "get_house_price",
          "get_random_bible_verse",
          "get_recovery_bible_verses",
          "get_recovery_bible_notes",
          "get_life_study_excerpt",
          "request_tool_development",
        ].includes(call.name) &&
        result?.replyText
      ) {
        return deliverDirectResult(result.replyText, userText, context);
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
      max_output_tokens: env.OPENAI_MAX_OUTPUT_TOKENS,
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
