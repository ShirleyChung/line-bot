import { db } from "./firestore.js";
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
  if (!(data.time instanceof Date) || Number.isNaN(data.time.getTime())) {
    throw new Error("createReminder 的 time 必須是有效的 Date");
  }
  const doc = await db.collection(COLLECTION).add({
    ...data,
    notified: false,
    createdAt: new Date(),
  });
  return doc.id;
}

/**
 * 取得到期的提醒事項
 * @param {Date} now - 目前時間的 Date 物件
 * @returns {Promise<Array>} - 回傳提醒事項陣列，每個元素包含 id、owner、target、action、time 等欄位
 */
export async function getDueReminders(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("getDueReminders 的 now 必須是有效的 Date");
  }
  const snapshot = await db
    .collection(COLLECTION)
    .where("time", "<=", now)
    .where("notified", "==", false)
    .get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * 標記已通知
 */
export async function markNotified(id) {
  await db.collection(COLLECTION).doc(id).update({
    notified: true,
    notifiedAt: new Date(),
  });
}

/**
 * 刪除提醒
 */
export async function deleteReminder(id) {
  await db.collection(COLLECTION).doc(id).delete();
}