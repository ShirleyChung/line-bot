// services/firestore.js
import { Firestore } from "@google-cloud/firestore";

/**
 * 專案共用的 Firestore client。
 * 其他 service 都透過這個 instance 存取資料，避免各自建立連線設定。
 */
export const db = new Firestore({
  projectId: "shirleylineagent",
});
