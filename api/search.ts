// Busca vetorial pública: rate-limit por IP e top-k de modelos.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { searchModels } from "../lib/vectorSearch.js";
import { searchLimiter, clientIp } from "../lib/ratelimit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "use POST" });
  }

  // gatekeeper: rate-limit por IP
  const { success, limit, remaining } = await searchLimiter.limit(clientIp(req.headers));
  if (!success) {
    return res.status(429).json({ erro: "rate limit exceeded", limit, remaining });
  }

  // validação de entrada
  const { situacao, topK } = (req.body ?? {}) as { situacao?: string; topK?: number };
  if (!situacao || typeof situacao !== "string") {
    return res.status(400).json({ erro: "field 'situacao' (string) is required" });
  }

  const modelos = await searchModels(situacao, Math.min(topK ?? 5, 20));
  return res.status(200).json({ modelos });
}
