import { Firestore } from "@google-cloud/firestore";
import { env } from "../config/env.js";

// Firestore client 共用同一個 projectId，避免各 repository 重複建立設定。
export const db = new Firestore({
  projectId: env.FIRESTORE_PROJECT_ID,
});

export function nowDate() {
  // 集中取得目前時間，之後若要改成 Firestore Timestamp 可只調整這裡。
  return new Date();
}
