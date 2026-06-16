import { env } from "../config/env.js";

export function verifyRequest(req, res, next) {
  // 沒設定 shared secret 時允許本機或內網測試直接呼叫。
  if (!env.EVOLVE_ENGINE_SHARED_SECRET) {
    return next();
  }

  // 正式環境用 Bearer token 保護 intake endpoint，避免外部任意建立工作單。
  const expected = `Bearer ${env.EVOLVE_ENGINE_SHARED_SECRET}`;
  if (req.get("authorization") !== expected) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
    });
  }

  return next();
}
