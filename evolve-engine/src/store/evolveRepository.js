import { db, nowDate } from "./firestore.js";
import { env } from "../config/env.js";

const REQUESTS = "evolve_requests";
const ESTIMATES = "evolve_estimates";
const JOBS = "evolve_jobs";
const FUTURE_GOALS = "future_goals";

export async function createRequest(payload) {
  // 每一筆使用者需求先以 received 狀態落庫，後續估算與排程都用 requestId 串起來。
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
  // estimate 使用 requestId 當 doc id，讓同一需求的估算結果可被覆寫且容易查找。
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
  // 超過自動處理門檻的需求改存 future_goals，避免 evolveEngine 自行啟動高風險變更。
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

  // 同步回寫原始 request 狀態，讓查詢端不用跨 collection 才知道目前進度。
  await db.collection(REQUESTS).doc(request.id).update({
    status: "deferred",
    futureGoalId: ref.id,
    updatedAt: now,
  });

  return { id: ref.id, ...doc };
}

export async function createImplementationJob(request, estimate) {
  // 可自動處理的需求會建立 job；實際執行方式由 EVOLVE_AGENT_MODE 決定。
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

  // request 只保存 jobId 與 queued 狀態，詳細 agent 狀態集中在 evolve_jobs。
  await db.collection(REQUESTS).doc(request.id).update({
    status: "queued",
    jobId: ref.id,
    updatedAt: now,
  });

  return { id: ref.id, ...doc };
}

export async function updateImplementationJob(jobId, patch) {
  // 所有 job 狀態更新都集中在這裡補 updatedAt，避免各呼叫點忘記維護時間戳。
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
