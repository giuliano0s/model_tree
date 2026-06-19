// Recomendação pedagógica: busca vetorial + ranqueamento e explicação por LLM.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
import { searchModels, type Modelo } from "../lib/vectorSearch.js";
import { recommendLimiter, clientIp } from "../lib/ratelimit.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// monta o prompt pedagógico com a situação e os candidatos
function montarPrompt(situacao: string, candidatos: Modelo[]): string {
  const lista = candidatos
    .map((c, i) => `${i + 1}. ${c.name} (${c.year}) [branch: ${c.branch}]`)
    .join("\n");
  return `You are a tutor in predictive modeling. A user described this situation:

"${situacao}"

The search returned these candidate models from a curated taxonomy:
${lista}

Pick the most suitable one(s) and explain didactically:
- why it fits the situation;
- when to prefer one candidate over another;
- one practical caveat.
Use only the candidates above and be direct. Reply in the same language the user wrote in.
Use the conventional form of technical terms, and never translate proper names of algorithms, libraries, models or methods (e.g. XGBoost, Random Forest, ARIMA, Transformer).`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "use POST" });
  }

  // gatekeeper apertado: protege o Vector E a cota do Gemini
  const { success, limit, remaining } = await recommendLimiter.limit(clientIp(req.headers));
  if (!success) {
    return res.status(429).json({ erro: "rate limit exceeded", limit, remaining });
  }

  // validação de entrada
  const { situacao, topK } = (req.body ?? {}) as { situacao?: string; topK?: number };
  if (!situacao || typeof situacao !== "string") {
    return res.status(400).json({ erro: "field 'situacao' (string) is required" });
  }

  const candidatos = await searchModels(situacao, Math.min(topK ?? 5, 20));

  // Gemini ranqueia e explica os candidatos
  const resposta = await ai.models.generateContent({
    model: MODEL,
    contents: montarPrompt(situacao, candidatos),
  });

  return res.status(200).json({ candidatos, recomendacao: resposta.text });
}
