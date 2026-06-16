import { db, nowDate } from "./firestore.js";
import { env } from "../config/env.js";

const REQUESTS = "evolve_requests";
const ESTIMATES = "evolve_estimates";
const JOBS = "evolve_jobs";
const FUTURE_GOALS = "future_goals";

export async function createRequest(payload) {
  const ref = db.collection(REQUESTS).doc();
  const now = nowDate();
  const doc = {
    ...payload,
    status: "received",
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(doc);
  return { id: ref.id, ...doc };
}

export async function saveEstimate(requestId, estimate) {
  const ref = db.collection(ESTIMATES).doc(requestId);
  const now = nowDate();
  const doc = {
    requestId,
    ...estimate,
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(doc);
  return { id: ref.id, ...doc };
}

export async function createFutureGoal(request, estimate) {
  const ref = db.collection(FUTURE_GOALS).doc();
  const now = nowDate();
  const doc = {
    requestId: request.id,
    goal: request.userText,
    reason: request.reason || "目前沒有可用工具或能力不足",
    missingCapability: request.missingCapability || "",
    expectedBehavior: request.expectedBehavior || "",
    estimatedMinutes: estimate.estimatedMinutes,
    priority: "normal",
    status: "backlog",
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(doc);
  await db.collection(REQUESTS).doc(request.id).update({
    status: "deferred",
    futureGoalId: ref.id,
    updatedAt: now,
  });

  return { id: ref.id, ...doc };
}

export async function createImplementationJob(request, estimate) {
  const ref = db.collection(JOBS).doc();
  const now = nowDate();
  const doc = {
    requestId: request.id,
    status: "pending_implementation",
    agentMode: env.EVOLVE_AGENT_MODE,
    estimatedMinutes: estimate.estimatedMinutes,
    branch: "",
    commitSha: "",
    testResult: null,
    deployResult: null,
    logsSummary: "",
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(doc);
  await db.collection(REQUESTS).doc(request.id).update({
    status: "queued",
    jobId: ref.id,
    updatedAt: now,
  });

  return { id: ref.id, ...doc };
}

export async function updateImplementationJob(jobId, patch) {
  const now = nowDate();
  const update = {
    ...patch,
    updatedAt: now,
  };

  await db.collection(JOBS).doc(jobId).update(update);
  return {
    id: jobId,
    ...update,
  };
}
