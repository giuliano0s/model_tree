// Chat aterrado na taxonomia: investiga se vago, busca 1x via tool quando confiante,
// responde em streaming.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";
import { searchModels } from "../lib/vectorSearch.js";
import { chatLimiter, clientIp } from "../lib/ratelimit.js";

const SYSTEM = `You are an expert tutor in predictive modeling (machine learning, deep learning, classical statistics). You help users find the most suitable TYPE of model for their problem, grounded in a curated taxonomy of ~365 model families.

Two kinds of requests:
- PROBLEM ("which model for X?"): recommend by technical fit, not by brand recognition. Prefer the approach, technique or foundational model that actually solves the task over the most famous named product. If the real solution is a derivative or application built on top of a model that is in the taxonomy (e.g. inpainting or ControlNet on top of Diffusion Models), recommend that foundational model and explain the application layer built on top of it.
- NAMED MODEL ("what does XGBoost do?"): the user asked about a specific model by name; answer about that exact model directly.

How to behave:
- If a PROBLEM request is vague or underspecified, ask 1 to 3 focused clarifying questions first. Do not search yet.
- Once you have enough detail and are confident, call the tool "search_models" EXACTLY ONCE, with a concise English query that describes the underlying TECHNICAL task and constraints, not the user's brand words.
- After receiving candidates, base your answer ONLY on them and their documented properties (strengths, weaknesses, recommended_for, not_recommended_for). Do not invent models that are not in the results.
- Honesty over a forced answer. If no candidate genuinely fits (low relevance, or the task lies outside their documented strengths), LEAD with that verdict ("none of these is a good fit, because...") instead of presenting the least-bad option as a recommendation. Then explain which approach or family would actually solve it, and state clearly when it is not covered by the taxonomy.
- Be transparent about your source: you search a curated taxonomy by semantic similarity, and these are the closest matches.
- Keep technical terms and proper names of algorithms, libraries, models and methods in their conventional form; never translate them.
- Reply in the same language the user writes in.

Answer style:
- Do not restate or paraphrase the user's request, and do not announce that you are about to search. Go straight to the substance.
- Format for readability: short paragraphs, markdown headings (## and ###) and bullet points. Avoid walls of text; keep it visually scannable and didactic.`;

const searchTool = {
  functionDeclarations: [
    {
      name: "search_models",
      description:
        "Search the curated model taxonomy and return candidate model families matching a problem description.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "Concise English description of the underlying technical task, data and constraints.",
          },
        },
        required: ["query"],
      },
    },
  ],
};

type Msg = { role: "user" | "model"; text: string };

// repete a chamada em caso de sobrecarga transitória do modelo (503/429)
async function genStream(ai: GoogleGenAI, params: any, retries = 2) {
  for (let i = 0; ; i++) {
    try {
      return await ai.models.generateContentStream(params);
    } catch (e: any) {
      const status = e?.status ?? e?.code;
      if (i >= retries || (status !== 503 && status !== 429)) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("use POST");
    return;
  }

  const { success } = await chatLimiter.limit(clientIp(req.headers));
  if (!success) {
    res.status(429).json({ erro: "rate limit exceeded" });
    return;
  }

  const messages = (req.body ?? {}).messages as Msg[] | undefined;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ erro: "field 'messages' is required" });
    return;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const contents = messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");

  try {
    // primeira passada: pergunta mais ou decide buscar
    const first = await genStream(ai, {
      model,
      contents,
      config: { systemInstruction: SYSTEM, tools: [searchTool] },
    });

    // primeira passada bufferizada: decide entre perguntar ou buscar
    let fnCall: any = null;
    let preamble = "";
    for await (const chunk of first) {
      if (chunk.text) preamble += chunk.text;
      const calls = chunk.functionCalls;
      if (calls && calls.length) fnCall = calls[0];
    }

    if (fnCall) {
      // descarta a narração da busca; só a resposta aterrada vai ao usuário
      const query = String(fnCall.args?.query ?? "");
      const candidates = await searchModels(query, 6);

      const second = await genStream(ai, {
        model,
        contents: [
          ...contents,
          { role: "model", parts: [{ functionCall: fnCall }] },
          { role: "user", parts: [{ functionResponse: { name: fnCall.name, response: { candidates } } }] },
        ],
        config: { systemInstruction: SYSTEM },
      });

      for await (const chunk of second) {
        if (chunk.text) res.write(chunk.text);
      }
    } else if (preamble) {
      // pergunta de esclarecimento ou resposta direta
      res.write(preamble);
    }

    res.end();
  } catch (e: any) {
    console.error("chat error:", e);
    const status = e?.status ?? e?.code;
    const msg = status === 503
      ? "\n\n⚠️ The model is temporarily overloaded. Please try again in a moment."
      : "\n\n⚠️ Something went wrong generating the response. Please try again.";
    if (!res.writableEnded) {
      res.write(msg);
      res.end();
    }
  }
}
