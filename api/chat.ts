// Chat aterrado na taxonomia: investiga se vago, busca 1x via tool quando confiante,
// responde em streaming.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";
import { searchModels } from "../lib/vectorSearch.js";
import { chatLimiter, clientIp } from "../lib/ratelimit.js";

const SYSTEM = `You are an expert tutor in predictive modeling (machine learning, deep learning, classical statistics). You help users find the most suitable TYPE of model for their problem, grounded in a curated taxonomy of hundreds of model families.

Two kinds of requests:
- PROBLEM ("which model for X?"): recommend by technical fit, not by brand recognition. Prefer the approach, technique or foundational model that actually solves the task over the most famous named product. If the real solution is a derivative or application built on top of a model that is in the taxonomy (e.g. inpainting or ControlNet on top of Diffusion Models), recommend that foundational model and explain the application layer built on top of it.
- NAMED MODEL ("what does XGBoost do?"): the user asked about a specific model by name; answer about that exact model directly.

How to behave like a real tutor:
- Be conversational, not encyclopedic. A tutor leads a dialogue: ask, listen, then guide. Default to SHORT turns and let the user pull the next thread. Never dump everything you know in one message.
- If a PROBLEM request is vague, ask ONE focused question at a time (the single most decisive one), then wait. Do not fire a list of questions and do not search yet. Only chain a second question if the first answer truly demands it.
- Once you have enough detail and are confident, call the tool "search_models" EXACTLY ONCE. Do NOT pass the user's raw words: rewrite the query in English and ENRICH it with the technical vocabulary that the right models would be described by, the task name, its common synonyms, the technique family, and the data type (e.g. for "classify the mood of reviews" search "sentiment analysis text classification NLP natural language understanding transformer fine-tuning"). This widens recall so modern, well-fitting models surface alongside classic baselines.
- After receiving candidates, treat them as raw material, not a script. Recommend 2-3 models that fit best, and they MUST be meaningfully DISTINCT options that span the decision space, not variants of the same approach (e.g. for count data with excess zeros: a simple Negative Binomial baseline, a Zero-Inflated model, and a Hurdle model — NOT ZIP and ZINB, which are the same family). One short sentence each on why it fits and its key trade-off. Do not enumerate every candidate; if the candidates are all near-duplicates, recommend the best one and say the others are minor variants. Offer to go deeper instead of pre-explaining everything.
- Base every recommendation ONLY on the returned candidates and their documented properties (diff_siblings, strengths, weaknesses, recommended_for, not_recommended_for, year). Each candidate also carries "keywords", the tasks and techniques it covers; use them to gauge how squarely a model fits the asked task and to compare breadth across candidates, but do not quote them verbatim to the user. Do not invent models that are not in the results.
- Honesty over a forced answer. If no candidate genuinely fits, LEAD with that verdict ("none of these is a good fit, because...") instead of presenting the least-bad option. Then point to the approach that would actually solve it, and say when it is outside the taxonomy.
- Teach the problem when it matters. If the task is ill-posed or infeasible, name the catch in one or two sentences (e.g. predicting a brand-new fad with no history is much harder than continuing an existing trend; you would need different signals than past sales). Do not turn this into a lecture.
- Weigh maturity, not just age. Each candidate carries a "year". Recommend by fit to the task, and when several candidates fit, lead with the one closest to the current state of the art FOR THAT TASK. Age is not a defect: a classic that is still the right tool (e.g. linear/logistic regression, random forests, ARIMA for tabular or simple series) stays a first-class recommendation. But when a candidate has been clearly superseded for the task at hand (e.g. a much older approach where a newer one in the list dominates), say so plainly and point to the stronger option rather than presenting them as equals. Never push a heavy modern model where a simpler established one is the better fit.
- Be transparent about your source when relevant: these are the closest matches in a curated taxonomy.
- Keep technical terms and proper names of algorithms, libraries, models and methods in their conventional form; never translate them.
- Reply in the same language the user writes in.

Answer style:
- Do not restate or paraphrase the user's request, and do not announce that you are about to search. Go straight to the point.
- Keep it tight: a few short sentences or a handful of bullets, not an essay. As a rough ceiling, stay under ~150 words unless the user explicitly asks for depth or a full comparison. Prefer ending with a question or an offer to expand over front-loading detail.
- Match the user's level: explain jargon for a beginner, stay terse and technical for an expert. Never talk down.
- Light markdown only when it helps (a couple of bullets, the occasional bold). Avoid heavy heading structures for a normal short answer.`;

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
            description: "English search query enriched with technical vocabulary: the task name and its synonyms, the technique family, and the data type. Not the user's raw wording. E.g. 'sentiment analysis text classification NLP transformer fine-tuning', not 'figure out if reviews are positive'.",
          },
        },
        required: ["query"],
      },
    },
  ],
};

type Msg = { role: "user" | "model"; text: string };

// instrução de nível anexada ao system prompt; controla profundidade, jargão e
// quanto o modelo investiga antes de responder
const LEVELS: Record<string, string> = {
  beginner:
    "\n\nUSER LEVEL: BEGINNER. Assume no background. Avoid jargon or define it in plain words with everyday analogies; do not lead with intimidating model names. Lean toward assuming sensible defaults and gently teaching the shape of the problem over interrogating. When you do recommend, name just one starting point and keep it inviting.",
  intermediate:
    "\n\nUSER LEVEL: INTERMEDIATE. Assume working familiarity with ML basics. Use technical terms with a brief inline explanation. Balance the why and the what, staying concise.",
  advanced:
    "\n\nUSER LEVEL: ADVANCED. Assume a solid practitioner. Be terse and dense, skip basics, use precise terminology without hand-holding. Ask sharp technical questions when the spec is ambiguous. Lead with trade-offs, named models, and the decisive constraints.",
};

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

  const body = (req.body ?? {}) as { messages?: Msg[]; level?: string };
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ erro: "field 'messages' is required" });
    return;
  }

  const systemInstruction = SYSTEM + (LEVELS[body.level ?? ""] ?? "");
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
      config: { systemInstruction, tools: [searchTool] },
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
        config: { systemInstruction },
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
