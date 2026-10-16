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
    scheduledTime: null,
    failureCount: 0,
    lastNotifiedAt: new Date(),
    updatedAt: new Date(),
  });
}

/**
 * 提醒推送失敗時延後重試（指數退避），避免每次 cron 都重新產生內容
 * （頭條/新聞摘要會呼叫 LLM）而形成呼叫風暴。
 * 連續失敗達上限就放棄這一次：週期提醒排到下一次，一次性提醒刪除。
 *
 * @returns {Promise<"retry"|"rescheduled"|"deleted">}
 */
export async function deferFailedReminder(reminder, now, nextOccurrence, { maxAttempts = 3 } = {}) {
  const failureCount = (Number(reminder.failureCount) || 0) + 1;

  if (failureCount < maxAttempts) {
    const retryAt = new Date(now.getTime() + 5 * 60_000 * 2 ** (failureCount - 1));
    await db.collection(COLLECTION).doc(reminder.id).update({
      time: retryAt,
      // 保留原本排定的時刻，重試成功後週期提醒仍以原時刻排下一次。
      scheduledTime: reminder.scheduledTime || reminder.time,
      failureCount,
      lastFailedAt: new Date(),
      updatedAt: new Date(),
    });
    return "retry";
  }

  if (nextOccurrence) {
    await db.collection(COLLECTION).doc(reminder.id).update({
      time: nextOccurrence,
      scheduledTime: null,
      failureCount: 0,
      lastFailedAt: new Date(),
      updatedAt: new Date(),
    });
    return "rescheduled";
  }

  await deleteReminder(reminder.id);
  return "deleted";
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

// 去掉空白與「提醒/自己/我的」這類不具辨識度的字，只留下可比對的關鍵字。
export function normalizeReminderKeyword(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .replace(/提醒|通知|自己|我的|我|的/g, "")
    .toLowerCase();
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

  // 如果提供 id，直接刪除該筆；模型可能編造不存在的 id，此時改用編號/關鍵字比對。
  if (criteria.id) {
    const doc = await db.collection(COLLECTION).doc(criteria.id).get();
    if (doc.exists && doc.data().owner === owner) {
      await db.collection(COLLECTION).doc(criteria.id).delete();
      return { deleted: 1, id: criteria.id, reminder: doc.data() };
    }
    if (!criteria.index && !criteria.target && !criteria.action) {
      return { deleted: 0, message: "找不到此提醒" };
    }
  }

  const reminders = await listReminders(owner);

  // 依「列出提醒」顯示的編號刪除（1 起算，與 listReminders 的排序一致）。
  let matched;
  if (Number.isInteger(criteria.index) && criteria.index > 0) {
    const reminder = reminders[criteria.index - 1];
    if (!reminder) {
      return { deleted: 0, message: `找不到第 ${criteria.index} 個提醒，目前共有 ${reminders.length} 個提醒` };
    }
    matched = [reminder];
  } else {
    // 模型給的 target/action 常與儲存值不完全相同（例如「訂蛋糕」vs「提醒我訂蛋糕」），
    // 改用關鍵字模糊比對：每個有意義的關鍵字都要出現在提醒的 target/action 中。
    const keywords = [criteria.target, criteria.action]
      .map(normalizeReminderKeyword)
      .filter(Boolean);
    if (!keywords.length) {
      return { deleted: 0, message: "請說明要刪除哪一個提醒，例如「刪除訂蛋糕的提醒」或「刪除第 1 個提醒」" };
    }
    matched = reminders.filter((reminder) => {
      const haystack = normalizeReminderKeyword(`${reminder.target || ""}${reminder.action || ""}`);
      return keywords.every((keyword) => haystack.includes(keyword));
    });
  }

  if (!matched.length) {
    return { deleted: 0, message: "找不到符合條件的提醒" };
  }

  // 刪除所有符合的提醒
  const batch = db.batch();
  const deletedReminders = [];
  matched.forEach((reminder) => {
    batch.delete(db.collection(COLLECTION).doc(reminder.id));
    deletedReminders.push(reminder);
  });

  await batch.commit();

  return {
    deleted: deletedReminders.length,
    reminders: deletedReminders,
    message: `已刪除 ${deletedReminders.length} 筆提醒`,
  };
}
