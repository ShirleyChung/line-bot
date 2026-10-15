/**
 * Webhook 事件去重。
 *
 * LINE（開啟 redelivery 時）、Telegram、Meta、Teams 在逾時或失敗時都會重送同一事件；
 * 若每次都重新處理，一則訊息可能觸發多輪 LLM 呼叫與重複回覆。
 * 這裡用 Firestore create() 的原子性「認領」事件，已處理過的就略過。
 *
 * processed_events 文件帶有 expireAt，可在 Firestore 設定 TTL policy 自動清除。
 */
import { db } from "./firestore.js";
import { buildSessionKey } from "./conversationStateService.js";

const COLLECTION = "processed_events";
const RETENTION_MS = 24 * 60 * 60_000;
// Firestore gRPC ALREADY_EXISTS
const ALREADY_EXISTS = 6;

export function getEventDedupeKey(event) {
  if (event?.webhookEventId) return `line:${event.webhookEventId}`;
  if (event?.platform && event.platform !== "line" && event.message?.id) {
    return `${event.platform}:${buildSessionKey(event.source)}:${event.message.id}`;
  }
  return null;
}

/**
 * 嘗試認領事件；回傳 false 代表已處理過（重送），呼叫端應略過。
 * Firestore 發生其他錯誤時放行，避免去重機制本身讓 bot 停擺。
 */
export async function claimWebhookEvent(event) {
  const key = getEventDedupeKey(event);
  if (!key) return true;

  try {
    await db.collection(COLLECTION).doc(key.replace(/\//g, "_")).create({
      key,
      createdAt: new Date(),
      expireAt: new Date(Date.now() + RETENTION_MS),
    });
    return true;
  } catch (error) {
    if (error?.code === ALREADY_EXISTS) {
      console.warn("[dedupe] skip redelivered webhook event:", key);
      return false;
    }
    console.error("[dedupe] claim event failed, processing anyway:", key, error);
    return true;
  }
}
