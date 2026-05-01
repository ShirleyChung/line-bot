import { Firestore } from "@google-cloud/firestore";

const db = new Firestore({ projectId: "shirleylineagent" });
const COLLECTION = "user_memory";

function getDocRef(sessionKey) {
  return db.collection(COLLECTION).doc(sessionKey);
}

/**
 * 取得使用者記憶
 */
export async function getUserMemory(sessionKey) {
  const doc = await getDocRef(sessionKey).get();
  if (!doc.exists) return null;
  return doc.data();
}

/**
 * 更新（merge）
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