// ENDPOINT /api/recommend usado pelo site: busca + LLM pedagógica.
// Fluxo: rate-limit (apertado) -> busca vetorial -> Gemini explica -> JSON.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
import { searchModels, type Modelo } from "../lib/vectorSearch.js";
import { recommendLimiter, clientIp } from "../lib/ratelimit.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// monta o prompt pedagógico a partir da situação e dos candidatos da busca
function montarPrompt(situacao: string, candidatos: Modelo[]): string {
  const lista = candidatos
    .map((c, i) => `${i + 1}. ${c.name} (${c.year}) [ramo: ${c.branch}]`)
    .join("\n");
  return `Você é um tutor de modelagem preditiva. Um usuário descreveu esta situação:

"${situacao}"

A busca retornou estes modelos candidatos da nossa árvore curada:
${lista}

Escolha o(s) mais adequado(s) e explique de forma didática, em português do Brasil:
- por que ele se encaixa na situação;
- quando preferir um candidato em vez de outro;
- uma ressalva ou cuidado prático.
Use apenas os candidatos acima e seja direto.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "use POST" });
  }

  // gatekeeper apertado: protege o Vector E a cota do Gemini
  const { success, limit, remaining } = await recommendLimiter.limit(clientIp(req.headers));
  if (!success) {
    return res.status(429).json({ erro: "limite de requisições atingido", limit, remaining });
  }

  // validação de entrada
  const { situacao, topK } = (req.body ?? {}) as { situacao?: string; topK?: number };
  if (!situacao || typeof situacao !== "string") {
    return res.status(400).json({ erro: "campo 'situacao' (string) é obrigatório" });
  }

  // 1. busca: mesmos candidatos que o /api/search retornaria
  const candidatos = await searchModels(situacao, Math.min(topK ?? 5, 20));

  // 2. passo extra: Gemini ranqueia e explica de forma pedagógica
  const resposta = await ai.models.generateContent({
    model: MODEL,
    contents: montarPrompt(situacao, candidatos),
  });

  return res.status(200).json({ candidatos, recomendacao: resposta.text });
}
