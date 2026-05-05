// services/firestore.js
import { Firestore } from "@google-cloud/firestore";

export const db = new Firestore({
  projectId: "shirleylineagent",
});