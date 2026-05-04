// src/services/sessionStateService.js

import { Firestore } from "@google-cloud/firestore";

const db = new Firestore({ projectId: "shirleylineagent" });
const COLLECTION = "session_state";

export async function setLatestImageId(sessionKey, imageId) {
  await db.collection(COLLECTION).doc(sessionKey).set(
    {
      latestImageId: imageId,
      latestImageAt: new Date(),
    },
    { merge: true }
  );
}

export async function getLatestImageId(sessionKey) {
  const doc = await db.collection(COLLECTION).doc(sessionKey).get();
  if (!doc.exists) return null;

  const data = doc.data();
  return data.latestImageId || null;
}