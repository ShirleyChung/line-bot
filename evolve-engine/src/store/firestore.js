import { Firestore } from "@google-cloud/firestore";
import { env } from "../config/env.js";

export const db = new Firestore({
  projectId: env.FIRESTORE_PROJECT_ID,
});

export function nowDate() {
  return new Date();
}
