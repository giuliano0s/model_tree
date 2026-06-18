// ENDPOINT /api/search usado pelo MCP: só busca, sem LLM.
// Fluxo: rate-limit por IP -> busca vetorial -> top-k em JSON.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { searchModels } from "../lib/vectorSearch.js";
import { searchLimiter, clientIp } from "../lib/ratelimit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "use POST" });
  }

  // gatekeeper: barra antes de tocar o Vector
  const { success, limit, remaining } = await searchLimiter.limit(clientIp(req.headers));
  if (!success) {
    return res.status(429).json({ erro: "limite de requisições atingido", limit, remaining });
  }

  // validação de entrada
  const { situacao, topK } = (req.body ?? {}) as { situacao?: string; topK?: number };
  if (!situacao || typeof situacao !== "string") {
    return res.status(400).json({ erro: "campo 'situacao' (string) é obrigatório" });
  }

  const modelos = await searchModels(situacao, Math.min(topK ?? 5, 20));
  return res.status(200).json({ modelos });
}
