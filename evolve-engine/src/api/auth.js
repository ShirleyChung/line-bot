import { env } from "../config/env.js";

export function verifyRequest(req, res, next) {
  if (!env.EVOLVE_ENGINE_SHARED_SECRET) {
    return next();
  }

  const expected = `Bearer ${env.EVOLVE_ENGINE_SHARED_SECRET}`;
  if (req.get("authorization") !== expected) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
    });
  }

  return next();
}
