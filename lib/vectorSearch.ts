// Busca vetorial compartilhada pelos endpoints. Cliente read-only.

import { Index } from "@upstash/vector";
import { rerank, type Profile, type Ranked } from "./rerank.js";
import { HIDDEN_IDS } from "./hidden.js";

const index = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL!,
  token: process.env.UPSTASH_VECTOR_REST_READONLY_TOKEN!,
});

export type Modelo = {
  id: string;
  score: number;
  name?: string;
  year?: number;
  branch?: string;
  diffSiblings?: string;
  strengths?: string[];
  weaknesses?: string[];
  recommendedFor?: string[];
  notRecommendedFor?: string[];
  curiosity?: string;
  keywords?: string[];
  statFit?: Record<string, unknown>;
};

// consulta o índice híbrido (denso + BM25) com texto cru e devolve o top-k
export async function searchModels(situacao: string, topK = 5): Promise<Modelo[]> {
  const resultados = await index.query({
    data: situacao,
    topK,
    includeMetadata: true,
  });

  return resultados.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id),
      score: Math.round((r.score ?? 0) * 1e4) / 1e4,
      name: m.name as string | undefined,
      year: m.year as number | undefined,
      branch: m.branch as string | undefined,
      diffSiblings: m.diff_siblings as string | undefined,
      strengths: m.strengths as string[] | undefined,
      weaknesses: m.weaknesses as string[] | undefined,
      recommendedFor: m.recommended_for as string[] | undefined,
      notRecommendedFor: m.not_recommended_for as string[] | undefined,
      curiosity: m.curiosity as string | undefined,
      keywords: m.keywords as string[] | undefined,
      statFit: m.stat_fit as Record<string, unknown> | undefined,
    };
  });
}

// CORE da ferramenta: dado o perfil, surfaca os modelos OCULTOS (recentes/nicho que o LLM
// subrepresenta) que cabem no dataset. Recupera um pool amplo da base (só leitura), filtra para
// o conjunto curado de ocultos, e reordena por encaixe estatístico. Devolve poucos, com razões.
export async function searchOverlookedModels(
  situacao: string,
  profile: Profile,
  topK = 6,
  pool = 40,
): Promise<Ranked[]> {
  const candidatos = (await searchModels(situacao, Math.min(pool, 50))).filter((m) =>
    HIDDEN_IDS.has(m.id),
  );
  return rerank(profile, candidatos, topK);
}
