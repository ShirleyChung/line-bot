/**
 * 使用 Firestore 儲存對話狀態
 *
 * 本檔案使用 collection / document 來保存各個 session 的 lastResponseId。
 * 對應 LINE bot 來源：
 * - 一對一聊天：user:Uxxxx
 * - 群組聊天：group:Gxxxx
 * - room 聊天：room:Rxxxx
 *
 * 主要需求：
 * 1. 根據 session key 讀取 lastResponseId
 * 2. 在每次對話結束後更新 lastResponseId
 */
import { db } from "./firestore.js";

/**
 * collection 名稱
 * 部署後，可以在 Firestore Studio 中看到這個 collection。
 */
const COLLECTION_NAME = "conversation_state";

/**
 * 取得 collection reference
 */
function getCollection() {
  return db.collection(COLLECTION_NAME);
}

/**
 * 根據 LINE source 建立 session key
 *
 * @param {object} source - LINE webhook event.source
 * @returns {string}
 */
export function buildSessionKey(source) {
  if (!source || !source.type) {
    return "unknown";
  }

  if (source.platform && source.userId) {
    return `${source.platform}:user:${source.userId}`;
  }

  if (source.type === "user") {
    return `user:${source.userId}`;
  }

  if (source.type === "group") {
    return `group:${source.groupId}`;
  }

  if (source.type === "room") {
    return `room:${source.roomId}`;
  }

  return "unknown";
}

/**
 * 讀取指定 session 的對話狀態
 *
 * 回傳格式範例：
 * {
 *   lastResponseId: "resp_abc123",
 *   updatedAt: "2026-04-30T12:00:00.000Z"
 * }
 *
 * @param {string} sessionKey
 * @returns {Promise<object|null>}
 */
export async function getConversationState(sessionKey) {
  if (!sessionKey) {
    return null;
  }

  const docRef = getCollection().doc(sessionKey);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    return null;
  }

  return snapshot.data();
}

/**
 * 寫入 / 更新指定 session 的 lastResponseId
 *
 * 這裡使用 merge: true，避免覆蓋狀態、也不會影響其他欄位資料。
 *
 * @param {string} sessionKey
 * @param {string} lastResponseId
 * @returns {Promise<void>}
 */
export async function setConversationState(sessionKey, lastResponseId) {
  if (!sessionKey) {
    throw new Error("setConversationState 需要 sessionKey");
  }

  if (!lastResponseId) {
    throw new Error("setConversationState 需要 lastResponseId");
  }

  const docRef = getCollection().doc(sessionKey);

  await docRef.set(
    {
      lastResponseId,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

/**
 * 只清除 OpenAI Responses API 的續接 ID，保留同一文件內的 Gemini 歷史等狀態。
 * 當先前 response 留有未完成 tool call 或已失效時，用於自動重建對話鏈。
 *
 * @param {string} sessionKey
 * @returns {Promise<void>}
 */
export async function clearOpenAiConversationState(sessionKey) {
  if (!sessionKey) {
    throw new Error("clearOpenAiConversationState 需要 sessionKey");
  }

  await getCollection().doc(sessionKey).set(
    {
      lastResponseId: null,
      openAiStateResetAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

/**
 * Gemini 沒有 previous_response_id，因此只保存有固定上限的文字對話。
 * tool call / tool response 不寫入 Firestore，避免大型結果讓文件持續膨脹。
 *
 * @param {string} sessionKey
 * @param {Array<{role:string,parts:Array<{text:string}>}>} history
 * @returns {Promise<void>}
 */
export async function setGeminiConversationState(sessionKey, history) {
  if (!sessionKey) {
    throw new Error("setGeminiConversationState 需要 sessionKey");
  }

  const docRef = getCollection().doc(sessionKey);
  await docRef.set(
    {
      geminiHistory: Array.isArray(history) ? history : [],
      geminiUpdatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

/**
  * 刪除指定 session 的對話狀態
 * @param {string} sessionKey
 * @returns {Promise<void>}
 */
export async function clearConversationState(sessionKey) {
  if (!sessionKey) {
    throw new Error("clearConversationState 需要 sessionKey");
  }

  const docRef = getCollection().doc(sessionKey);
  await docRef.delete();
}
