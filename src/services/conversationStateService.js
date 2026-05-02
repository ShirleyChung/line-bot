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

import { Firestore } from "@google-cloud/firestore";

/**
 * 建立 Firestore client
 *
 * 在 Cloud Run / GCP 環境下，通常可以直接使用預設憑證。
 * 如果需要，可指定 projectId，也可以改為：
 *
 * const db = new Firestore({ projectId: "your-project-id" });
 */
const db = new Firestore();

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
  * 刪除指定 session 的對話狀態
 * @param {string} sessionKey
 * @returns {Promise<void>}
 */
export async function clearConversationState(sessionKey) {
  if (!sessionKey) {
    throw new Error("clearConversationState �ʤ� sessionKey");
  }

  const docRef = getCollection().doc(sessionKey);
  await docRef.delete();
}