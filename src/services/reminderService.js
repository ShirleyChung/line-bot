import { Firestore } from "@google-cloud/firestore";

const db = new Firestore({ projectId: "shirleylineagent" });
const COLLECTION = "reminders";

/**
 * 提醒功能相關的資料庫操作
 *
 * 1. 建立 reminder：createReminder(data)
 * 2. 取得到期的 reminder：getDueReminders(nowIso)
 * 3. 標記 reminder 已通知過了：markNotified(id)
 * 4. 刪掉 reminder：deleteReminder(id)
 */
export async function createReminder(data) {
  const doc = await db.collection(COLLECTION).add({
    ...data,
    notified: false,
    createdAt: new Date().toISOString(),
  });

  return doc.id;
}

/**
 * 取得到期的提醒事項
 * @param {string} nowIso - ISO 格式的目前時間，例如 "2024-06-01T12:00:00.000Z"
 * @returns {Promise<Array>} - 回傳提醒事項陣列，每個元素包含 id、owner、target、action、time 等欄位
 */
export async function getDueReminders(nowIso) {
  const snapshot = await db
    .collection(COLLECTION)
    .where("time", "<=", nowIso)
    .where("notified", "==", false)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * 標記此 reminder 已經通知過了，避免重複通知。
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function markNotified(id) {
  await db.collection(COLLECTION).doc(id).update({
    notified: true,
  });
}

/**
 * 刪掉此筆 reminder（通常是因為使用者取消了提醒，或是已經不需要了）
 * 注意：這個動作無法復原，請務必確認 id 是正確的。
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteReminder(id) {
  await db.collection(COLLECTION).doc(id).delete();
}