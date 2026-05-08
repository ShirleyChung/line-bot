// src/services/sessionStateService.js
import { db } from "./firestore.js";
const COLLECTION = "session_state";

function getTaipeiDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getImageIdsFromData(data) {
  if (Array.isArray(data?.imageIds)) {
    return data.imageIds.filter(Boolean);
  }

  if (data?.latestImageId) {
    return [data.latestImageId];
  }

  return [];
}

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

export async function addImageId(sessionKey, imageId) {
  if (!sessionKey || !imageId) return;

  const docRef = db.collection(COLLECTION).doc(sessionKey);
  const todayKey = getTaipeiDateKey();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    const data = snapshot.exists ? snapshot.data() : {};
    const storedDateKey = getStoredImageDateKey(data);
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

export async function setLatestImageId(sessionKey, imageId) {
  await addImageId(sessionKey, imageId);
}

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

export async function getImageIds(sessionKey) {
  const doc = await db.collection(COLLECTION).doc(sessionKey).get();
  if (!doc.exists) return [];

  const data = doc.data();
  const storedDateKey = getStoredImageDateKey(data);
  if (storedDateKey && storedDateKey !== getTaipeiDateKey()) {
    await clearImageIds(sessionKey);
    return [];
  }

  return getImageIdsFromData(data);
}

export async function getLatestImageId(sessionKey) {
  const imageIds = await getImageIds(sessionKey);
  return imageIds.at(-1) || null;
}
