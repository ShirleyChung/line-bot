// src/services/sessionStateService.js
import { db } from "./firestore.js";
const COLLECTION = "session_state";

/**
 * 圖片批次以台北日期為界線。
 * Cloud Run 的系統時區不一定是 Asia/Taipei，因此這裡明確指定時區。
 * @param {Date} date - 日期物件，預設為目前時間
 * @returns {string} 日期字串，格式 YYYY-MM-DD
 */
function getTaipeiDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * 從儲存的資料中取得圖片 ID 陣列
 * @param {object} data - Firestore 文件資料
 * @returns {Array<string>} 圖片 ID 陣列
 */
function getImageIdsFromData(data) {
  if (Array.isArray(data?.imageIds)) {
    return data.imageIds.filter(Boolean);
  }

  if (data?.latestImageId) {
    return [data.latestImageId];
  }

  return [];
}

/**
 * 舊資料可能只有 latestImageAt，新的資料會有 imageBatchDate。
 * 這個 helper 讓兩種格式都可以判斷是否仍屬於今天的圖片批次。
 * @param {object} data - Firestore 文件資料
 * @returns {string|null} 日期字串或 null
 */
function getStoredImageDateKey(data) {
  if (data?.imageBatchDate) {
    return data.imageBatchDate;
  }

  const latestImageAt = data?.latestImageAt;
  if (latestImageAt?.toDate) {
    return getTaipeiDateKey(latestImageAt.toDate());
  }

  if (latestImageAt instanceof Date) {
    return getTaipeiDateKey(latestImageAt);
  }

  return null;
}

/**
 * 新增圖片 ID 到當前批次
 * @param {string} sessionKey - session 識別碼
 * @param {string} imageId - 圖片 ID
 * @returns {Promise<void>}
 */
export async function addImageId(sessionKey, imageId) {
  if (!sessionKey || !imageId) return;

  const docRef = db.collection(COLLECTION).doc(sessionKey);
  const todayKey = getTaipeiDateKey();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    const data = snapshot.exists ? snapshot.data() : {};
    const storedDateKey = getStoredImageDateKey(data);
    // 跨日後自動開新批次，避免今天的 OCR 要求誤用昨天上傳的圖片。
    const currentImageIds =
      storedDateKey === todayKey ? getImageIdsFromData(data) : [];
    const nextImageIds = currentImageIds.includes(imageId)
      ? currentImageIds
      : [...currentImageIds, imageId];

    transaction.set(
      docRef,
      {
        imageIds: nextImageIds,
        latestImageId: imageId,
        latestImageAt: new Date(),
        imageBatchDate: todayKey,
      },
      { merge: true }
    );
  });
}

/**
 * 設定最新的圖片 ID（呼叫 addImageId）
 * @param {string} sessionKey - session 識別碼
 * @param {string} imageId - 圖片 ID
 * @returns {Promise<void>}
 */
export async function setLatestImageId(sessionKey, imageId) {
  await addImageId(sessionKey, imageId);
}

/**
 * 清除圖片批次記錄
 * @param {string} sessionKey - session 識別碼
 * @returns {Promise<void>}
 */
export async function clearImageIds(sessionKey) {
  if (!sessionKey) return;

  await db.collection(COLLECTION).doc(sessionKey).set(
    {
      imageIds: [],
      latestImageId: null,
      latestImageAt: null,
      imageBatchDate: null,
    },
    { merge: true }
  );
}

/**
 * 取得當前批次的圖片 ID 陣列
 * @param {string} sessionKey - session 識別碼
 * @returns {Promise<Array<string>>} 圖片 ID 陣列
 */
export async function getImageIds(sessionKey) {
  const doc = await db.collection(COLLECTION).doc(sessionKey).get();
  if (!doc.exists) return [];

  const data = doc.data();
  const storedDateKey = getStoredImageDateKey(data);
  // 讀取時也做一次跨日清除，避免狀態只讀不寫時殘留舊圖片。
  if (storedDateKey && storedDateKey !== getTaipeiDateKey()) {
    await clearImageIds(sessionKey);
    return [];
  }

  return getImageIdsFromData(data);
}

/**
 * 取得最新的圖片 ID
 * @param {string} sessionKey - session 識別碼
 * @returns {Promise<string|null>} 圖片 ID 或 null
 */
export async function getLatestImageId(sessionKey) {
  const imageIds = await getImageIds(sessionKey);
  return imageIds.at(-1) || null;
}

/**
 * 記錄最近一次聖經查詢上下文，供「再查註解 / 生命讀經」類追問使用
 * @param {string} sessionKey - session 識別碼
 * @param {object} context - 聖經查詢上下文
 * @returns {Promise<void>}
 */
export async function setLastBibleContext(sessionKey, context = {}) {
  if (!sessionKey) return;

  const payload = {
    ...(context.query ? { query: String(context.query).trim() } : {}),
    ...(context.reference ? { reference: String(context.reference).trim() } : {}),
    ...(context.keyword ? { keyword: String(context.keyword).trim() } : {}),
    ...(context.mode ? { mode: String(context.mode).trim() } : {}),
    updatedAt: new Date(),
  };

  await db.collection(COLLECTION).doc(sessionKey).set(
    {
      lastBibleContext: payload,
    },
    { merge: true }
  );
}

/**
 * 取得最近一次聖經查詢上下文
 * @param {string} sessionKey - session 識別碼
 * @returns {Promise<object|null>}
 */
export async function getLastBibleContext(sessionKey) {
  if (!sessionKey) return null;

  const doc = await db.collection(COLLECTION).doc(sessionKey).get();
  if (!doc.exists) return null;

  return doc.data()?.lastBibleContext || null;
}
