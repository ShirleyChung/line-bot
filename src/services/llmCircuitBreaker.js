/**
 * LLM 斷路器：避免 API 故障時大量請求持續打到 LLM，造成呼叫風暴與額外費用。
 *
 * - 額度用完 / 金鑰錯誤這類「重試也不會成功」的錯誤：立即斷路一段較長時間。
 * - 429 限流、5xx、逾時等暫時性錯誤：連續失敗達門檻才斷路，冷卻時間較短。
 * - 斷路期間所有 LLM 呼叫直接丟出錯誤，不發出任何 API 請求。
 *
 * 狀態只存在單一 Cloud Run instance 的記憶體內；多 instance 時各自獨立斷路，
 * 仍可把風暴壓到每個 instance 只打幾次。
 */
import { env } from "../config/env.js";

const state = {
  openUntil: 0,
  consecutiveFailures: 0,
  reason: "",
};

export const LLM_CIRCUIT_OPEN_CODE = "llm_circuit_open";

function isFatalLlmError(error) {
  const status = error?.status;
  const code = String(error?.code || error?.error?.code || "");
  const message = String(error?.message || "");
  return (
    status === 401 ||
    status === 403 ||
    code === "insufficient_quota" ||
    /insufficient_quota|exceeded your current quota|API key not valid|PERMISSION_DENIED/i.test(message)
  );
}

function isTransientLlmError(error) {
  const status = Number(error?.status);
  const message = String(error?.message || "");
  return (
    status === 429 ||
    status >= 500 ||
    /RESOURCE_EXHAUSTED|rate limit|timed? ?out|ETIMEDOUT|ECONNRESET|fetch failed/i.test(message) ||
    error?.name === "APIConnectionError" ||
    error?.name === "APIConnectionTimeoutError"
  );
}

function openCircuit(ms, reason) {
  state.openUntil = Date.now() + ms;
  state.reason = reason;
  console.warn(JSON.stringify({
    severity: "WARNING",
    message: "LLM circuit opened",
    event: "llm_circuit_open",
    reason,
    open_ms: ms,
  }));
}

/**
 * 呼叫 LLM 前檢查；斷路中會丟出錯誤，message 可直接回覆給使用者。
 */
export function assertLlmAvailable() {
  if (Date.now() < state.openUntil) {
    const error = new Error(
      state.reason === "fatal"
        ? "AI 服務額度已用完或設定有誤，暫時停止使用，請通知管理員處理。"
        : "AI 服務暫時無法使用，請稍後再試。"
    );
    error.code = LLM_CIRCUIT_OPEN_CODE;
    throw error;
  }
}

export function recordLlmSuccess() {
  state.consecutiveFailures = 0;
}

export function recordLlmFailure(error) {
  if (isFatalLlmError(error)) {
    state.consecutiveFailures = 0;
    openCircuit(env.LLM_CIRCUIT_FATAL_COOLDOWN_MS, "fatal");
    return;
  }
  if (!isTransientLlmError(error)) return;

  state.consecutiveFailures += 1;
  if (state.consecutiveFailures >= env.LLM_CIRCUIT_FAILURE_THRESHOLD) {
    state.consecutiveFailures = 0;
    openCircuit(env.LLM_CIRCUIT_TRANSIENT_COOLDOWN_MS, "transient");
  }
}

/**
 * 以斷路器包住一次 LLM 呼叫。
 */
export async function guardLlmCall(fn) {
  assertLlmAvailable();
  try {
    const result = await fn();
    recordLlmSuccess();
    return result;
  } catch (error) {
    recordLlmFailure(error);
    throw error;
  }
}

// 測試用：重設狀態
export function resetLlmCircuit() {
  state.openUntil = 0;
  state.consecutiveFailures = 0;
  state.reason = "";
}
