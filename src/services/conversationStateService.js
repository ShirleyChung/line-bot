/**
 * 使用 Firestore 儲存對話狀態
 *
 * 這個版本用 collection / document 來保存每個 session 的 lastResponseId。
 * 適合 LINE bot 這種：
 * - 一對一聊天：user:Uxxxx
 * - 群組聊天：group:Gxxxx
 * - room 聊天：room:Rxxxx
 *
 * 需求很單純：
 * 1. 根據 session key 讀取 lastResponseId
 * 2. 在每次對話完成後更新 lastResponseId
 */

import { Firestore } from "@google-cloud/firestore";

/**
 * 建立 Firestore client
 *
 * 在 Cloud Run / GCP 環境下，通常可直接使用預設認證。
 * 如果之後你想指定 projectId，也可以改成：
 *
 * const db = new Firestore({ projectId: "your-project-id" });
 */
const db = new Firestore();

/**
 * collection 名稱
 * 之後你可以在 Firestore Studio 直接看到這個 collection。
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
 * 讀取某個 session 的對話狀態
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
 * 寫入 / 更新某個 session 的 lastResponseId
 *
 * 這裡使用 merge: true，避免之後你額外加欄位時把整份文件蓋掉。
 *
 * @param {string} sessionKey
 * @param {string} lastResponseId
 * @returns {Promise<void>}
 */
export async function setConversationState(sessionKey, lastResponseId) {
  if (!sessionKey) {
    throw new Error("setConversationState 缺少 sessionKey");
  }

  if (!lastResponseId) {
    throw new Error("setConversationState 缺少 lastResponseId");
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
 * 清除某個 session 的對話狀態
 *
 * 你之後若想做「重設記憶」指令，可以直接呼叫這個。
 *
 * @param {string} sessionKey
 * @returns {Promise<void>}
 */
export async function clearConversationState(sessionKey) {
  if (!sessionKey) {
    throw new Error("clearConversationState 缺少 sessionKey");
  }

  const docRef = getCollection().doc(sessionKey);
  await docRef.delete();
}