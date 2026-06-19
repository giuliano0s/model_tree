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
};

// consulta o índice híbrido (denso + BM25) com texto cru e devolve o top-k
export async function searchModels(situacao: string, topK = 5): Promise<Modelo[]> {
  const resultados = await index.query({
    data: situacao,
    topK,
    includeMetadata: true,
  });

  return resultados.map((r) => ({
    id: String(r.id),
    score: Math.round((r.score ?? 0) * 1e4) / 1e4,
    name: r.metadata?.name as string | undefined,
    year: r.metadata?.year as number | undefined,
    branch: r.metadata?.branch as string | undefined,
  }));
}
