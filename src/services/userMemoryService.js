import { db } from "./firestore.js";
const COLLECTION = "user_memory";

/**
 * 取得 Firestore document reference
 * @param {string} sessionKey - session 識別碼
 * @returns {object} Firestore document reference
 */
function getDocRef(sessionKey) {
  return db.collection(COLLECTION).doc(sessionKey);
}

/**
 * 取得使用者記憶
 * @param {string} sessionKey - session 識別碼
 * @returns {Promise<object|null>} 使用者記憶物件或 null
 */
export async function getUserMemory(sessionKey) {
  const doc = await getDocRef(sessionKey).get();
  if (!doc.exists) return null;
  return doc.data();
}

/**
 * 更新使用者記憶（merge）
 * @param {string} sessionKey - session 識別碼
 * @param {object} patch - 要更新的資料
 * @returns {Promise<void>}
 */
export async function updateUserMemory(sessionKey, patch = {}) {
  if (typeof patch !== "object" || patch === null) {
    throw new Error("patch 必須是 object");
  }

  await getDocRef(sessionKey).set(
    {
      ...patch,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}