// Busca vetorial pública: rate-limit por IP e top-k de modelos.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { searchModels, searchOverlookedModels } from "../lib/vectorSearch.js";
import type { Profile } from "../lib/rerank.js";
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
  const { situacao, topK, profile, hidden } = (req.body ?? {}) as {
    situacao?: string;
    topK?: number;
    profile?: Profile;
    hidden?: boolean;
  };
  if (!situacao || typeof situacao !== "string") {
    return res.status(400).json({ erro: "field 'situacao' (string) is required" });
  }

  // hidden=true + perfil: surfaca só os modelos OCULTOS que cabem (o uso primário do MCP)
  if (hidden && profile && typeof profile === "object") {
    const modelos = await searchOverlookedModels(situacao, profile, Math.min(topK ?? 6, 20));
    return res.status(200).json({ modelos });
  }

  // sem hidden: busca crua top-k (usada pelo tutor do site para aterrar a resposta)
  const modelos = await searchModels(situacao, Math.min(topK ?? 5, 20));
  return res.status(200).json({ modelos });
}
