import { Firestore } from "@google-cloud/firestore";

const db = new Firestore({ projectId: "shirleylineagent" });
const COLLECTION = "reminders";

/**
 * 建立提醒
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
 * 取得到期提醒
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
 * 標記已通知
 */
export async function markNotified(id) {
  await db.collection(COLLECTION).doc(id).update({
    notified: true,
  });
}