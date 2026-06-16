import { env } from "../config/env.js";

export async function submitEvolveRequest(payload) {
  if (!env.EVOLVE_ENGINE_URL) {
    throw new Error("evolveEngine 尚未設定，請先設定 EVOLVE_ENGINE_URL");
  }

  const url = new URL("/requests", env.EVOLVE_ENGINE_URL);
  const headers = {
    "content-type": "application/json",
  };

  if (env.EVOLVE_ENGINE_SECRET) {
    headers.authorization = `Bearer ${env.EVOLVE_ENGINE_SECRET}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `evolveEngine request failed: HTTP ${response.status}`);
  }

  return data;
}
