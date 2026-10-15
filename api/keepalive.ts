// Keep-alive diário (cron da Vercel): toca o Redis e o Vector para o plano
// gratuito do Upstash não arquivar os bancos por inatividade.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { searchModels } from "../lib/vectorSearch.js";
import { searchLimiter } from "../lib/ratelimit.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // toca o Redis via rate-limit com chave fixa
  const { success } = await searchLimiter.limit("keepalive");
  if (!success) {
    return res.status(429).json({ erro: "rate limit exceeded" });
  }

  // query mínima no índice vetorial
  const modelos = await searchModels("keepalive", 1);
  return res.status(200).json({ ok: true, modelos: modelos.length });
}
