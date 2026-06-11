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
 * 重新排程提醒，主要給每日提醒使用
 */
export async function rescheduleReminder(id, nextTime) {
  if (!(nextTime instanceof Date) || Number.isNaN(nextTime.getTime())) {
    throw new Error("rescheduleReminder 的 nextTime 必須是有效的 Date");
  }

  await db.collection(COLLECTION).doc(id).update({
    time: nextTime,
    notified: false,
    lastNotifiedAt: new Date(),
    updatedAt: new Date(),
  });
}

/**
 * 更新提醒的 payload 欄位（使用 Firestore 點記法更新巢狀欄位）
 */
export async function updateReminderPayload(id, payloadUpdates) {
  const updates = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(payloadUpdates)) {
    updates[`payload.${key}`] = value;
  }
  await db.collection(COLLECTION).doc(id).update(updates);
}

/**
 * 刪除提醒
 */
export async function deleteReminder(id) {
  await db.collection(COLLECTION).doc(id).delete();
}

/**
 * 列出使用者的所有提醒
 * @param {string} owner - 提醒擁有者，格式如 user:Uxxxx、group:Gxxxx
 * @returns {Promise<Array>} - 回傳提醒事項陣列
 */
export async function listReminders(owner) {
  if (!owner) {
    throw new Error("listReminders 需要 owner 參數");
  }
  const snapshot = await db
    .collection(COLLECTION)
    .where("owner", "==", owner)
    .where("notified", "==", false)
    .orderBy("time", "asc")
    .get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * 根據條件刪除使用者的提醒
 * @param {string} owner - 提醒擁有者
 * @param {object} criteria - 刪除條件，可包含 target、action、id
 * @returns {Promise<object>} - 回傳刪除結果
 */
export async function deleteReminderByOwner(owner, criteria = {}) {
  if (!owner) {
    throw new Error("deleteReminderByOwner 需要 owner 參數");
  }

  // 如果提供 id，直接刪除該筆
  if (criteria.id) {
    const doc = await db.collection(COLLECTION).doc(criteria.id).get();
    if (!doc.exists) {
      return { deleted: 0, message: "找不到此提醒" };
    }
    const data = doc.data();
    if (data.owner !== owner) {
      return { deleted: 0, message: "無權刪除此提醒" };
    }
    await db.collection(COLLECTION).doc(criteria.id).delete();
    return { deleted: 1, id: criteria.id, reminder: data };
  }

  // 否則根據條件查詢後刪除
  let query = db.collection(COLLECTION).where("owner", "==", owner).where("notified", "==", false);

  if (criteria.target) {
    query = query.where("target", "==", criteria.target);
  }
  if (criteria.action) {
    query = query.where("action", "==", criteria.action);
  }

  const snapshot = await query.get();

  if (snapshot.empty) {
    return { deleted: 0, message: "找不到符合條件的提醒" };
  }

  // 刪除所有符合的提醒
  const batch = db.batch();
  const deletedReminders = [];
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
    deletedReminders.push({ id: doc.id, ...doc.data() });
  });

  await batch.commit();

  return {
    deleted: deletedReminders.length,
    reminders: deletedReminders,
    message: `已刪除 ${deletedReminders.length} 筆提醒`,
  };
}
