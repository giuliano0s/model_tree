// Busca vetorial compartilhada pelos endpoints. Cliente read-only.

import { Index } from "@upstash/vector";

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
    };
  });
}
