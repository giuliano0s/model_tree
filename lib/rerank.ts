// Re-ranker determinístico por stat_fit (sem LLM). Reordena os candidatos recuperados:
// filtra nó-categoria, rebaixa tipo/contraindicação, premia a capacidade pedida pelo perfil.
// Cada candidato sai com as razões, para ser auditável. Espelha demo/benchmarks/rerank.py.

import type { Modelo } from "./vectorSearch.js";

export type Profile = {
  task?: string;
  target_type?: string;
  n_rows?: number | null;
  n_features?: number | null;
  feature_types?: string[];
  flags?: string[];
};

export type Ranked = Modelo & { fitScore: number; reasons: string[] };

const W = {
  targetMatch: 3, targetMismatch: -6, targetNone: -1,
  featSubset: 2, featOverlap: 0.5, featDisjoint: -4,
  regimeFit: 2, regimeViolation: -3, contraFlag: -3, capability: 2,
};

const FLAG_TERMS: Record<string, string[]> = {
  overdispersion: ["overdispersion", "variance > mean", "variance exceeds", "overdispersed"],
  excess_zeros: ["zero-inflation", "zero inflation", "excess zeros", "many zeros", "zero inflated"],
  "p>n": ["p >> n", "p > n", "p>n", "high-dimensional", "more features than samples", "n < p"],
  imbalanced: ["class imbalance", "imbalanced", "severe class imbalance", "rare events"],
  needs_interpretability: ["interpretab", "inspectable model", "transparent model", "auditable model", "black box"],
};

const FLAG_CAPABILITY: Record<string, string[]> = {
  zero_training: ["no training", "zero-shot", "zero shot", "pretrained", "pre-trained",
    "no per-series training", "without training", "in-context", "no hyperparameter tuning",
    "foundation model", "amortized"],
  cold_start: ["cold start", "cold-start", "zero-shot", "zero shot", "few-shot",
    "no history", "new items", "new skus", "borrow"],
  needs_interpretability: ["interpretable", "auditable", "transparent", "white box",
    "coefficient", "feature importance", "inspectable"],
  big_data: ["large dataset", "large datasets", "large-scale", "large scale", "millions of",
    "tens of millions", "out-of-core", "streaming", "scalable", "scales to",
    "big data", "high-throughput", "distributed", "1e5", "1e6", "1e7",
    "10^5", "10^6", "10^7", "10m rows"],
};

const ROW_KW = /rows|samples|observations|examples|data ?points|sample size|dataset|\bn\b/;
// comparador AMARRADO ao número (evita pegar palavras soltas como "exceeds" sem relação)
const FLOOR_RE = /(?:\bn\s*<=?|<=?|below|under|fewer than|less than)\s*~?\s*(\d[\d,.]*)\s*([kKmM])?/;
const CEIL_RE = /(?:\bn\s*>=?|>=?|beyond|above|over|more than|exceeds|greater than)\s*~?\s*(\d[\d,.]*)\s*([kKmM])?/;

function reVal(m: RegExpMatchArray): number {
  let v = parseFloat(m[1].replace(/,/g, ""));
  const u = (m[2] || "").toLowerCase();
  if (u === "k") v *= 1e3; else if (u === "m") v *= 1e6;
  return v;
}

const isLeaf = (m: Modelo) => /^l\d+$/.test(String(m.id ?? ""));

type SF = Record<string, any>;
const sfOf = (m: Modelo): SF => (m.statFit && typeof m.statFit === "object" ? (m.statFit as SF) : {});

// violação de tamanho: SÓ o contraindicated_when (semântica "ruim quando"); ignora features/classes
function rowSizeViolation(n: number, sf: SF): { kind: string; val: number | null } | null {
  const text = ((sf.contraindicated_when as string[]) || []).join(" ").toLowerCase();
  for (const cl of text.split(/[;.,]| and /)) {
    if (!ROW_KW.test(cl)) continue;
    const mc = cl.match(CEIL_RE);
    if (mc && reVal(mc) >= 50 && n > reVal(mc)) return { kind: "ceiling", val: Math.round(reVal(mc)) };
    const mf = cl.match(FLOOR_RE);
    if (mf && reVal(mf) >= 50 && n < reVal(mf)) return { kind: "floor", val: Math.round(reVal(mf)) };
  }
  if (n < 1000 && /very small|small dataset|small data|tiny|too few|few samples|insufficient data|limited data|scarce data/.test(text))
    return { kind: "floor-small", val: null };
  if (n > 100000 && /very large|big data|massive|large-scale/.test(text))
    return { kind: "ceiling-large", val: null };
  return null;
}

function positiveText(m: Modelo, sf: SF): string {
  const parts: string[] = [];
  parts.push(...(m.strengths || []));
  parts.push(...(m.recommendedFor || []));
  parts.push(...(m.keywords || []));
  if (m.diffSiblings) parts.push(m.diffSiblings);
  parts.push(String((sf.data_regime as SF)?.rows ?? ""));
  parts.push(String((sf.features as SF)?.interpretability ?? ""));
  return parts.join(" ").toLowerCase();
}

function scoreCandidate(p: Profile, m: Modelo): { score: number; reasons: string[] } {
  const sf = sfOf(m);
  const reasons: string[] = [];
  let score = 0;

  const tgt = (((sf.target as SF)?.types as string[]) || []).map((t) => String(t).toLowerCase());
  const pt = (p.target_type || "").toLowerCase();
  if (pt && tgt.length) {
    if (tgt.includes(pt)) { score += W.targetMatch; reasons.push(`+target ${pt}`); }
    else if (tgt.includes("none")) { score += W.targetNone; reasons.push("~target none"); }
    else { score += W.targetMismatch; reasons.push(`-target mismatch (model: ${tgt.join(",")})`); }
  }

  const feats = new Set((((sf.features as SF)?.types as string[]) || []).map((f) => String(f).toLowerCase()));
  const pf = (p.feature_types || []).map((f) => f.toLowerCase());
  if (pf.length && feats.size) {
    const overlap = pf.filter((f) => feats.has(f));
    if (pf.every((f) => feats.has(f))) { score += W.featSubset; reasons.push("+features supported"); }
    else if (overlap.length) { score += W.featOverlap; reasons.push("~features partial"); }
    else { score += W.featDisjoint; reasons.push(`-feature type mismatch (model: ${[...feats].sort().join(",")})`); }
  }

  const n = p.n_rows;
  if (n) {
    const viol = rowSizeViolation(n, sf);
    if (viol) {
      score += W.regimeViolation;
      if (viol.kind === "floor") reasons.push(`-n=${n} below floor (~${viol.val})`);
      else if (viol.kind === "ceiling") reasons.push(`-n=${n} above ceiling (~${viol.val})`);
      else if (viol.kind === "floor-small") reasons.push(`-contraindicated on small data (n=${n})`);
      else reasons.push(`-contraindicated on very large data (n=${n})`);
    }
    const rl = String((sf.data_regime as SF)?.rows ?? "").toLowerCase();
    if (n <= 1000 && /(<= 1000|< 1k|<1k|small n|very small|small-to)/.test(rl)) {
      score += W.regimeFit; reasons.push(`+n=${n} in model sweet spot`);
    }
  }

  const contra = ((sf.contraindicated_when as string[]) || []).join(" ").toLowerCase();
  const pos = positiveText(m, sf);
  for (const flag of p.flags || []) {
    if ((FLAG_TERMS[flag] || []).some((t) => contra.includes(t))) {
      score += W.contraFlag; reasons.push(`-contraindicated for ${flag}`);
    }
    if ((FLAG_CAPABILITY[flag] || []).some((t) => pos.includes(t))) {
      score += W.capability; reasons.push(`+supports ${flag}`);
    }
  }

  return { score, reasons };
}

// reordena: descarta nó-categoria, pontua, ordena por (score, ordem de retrieval)
export function rerank(profile: Profile, candidates: Modelo[], keep?: number): Ranked[] {
  const leaves = candidates.filter(isLeaf);
  const scored: Ranked[] = leaves.map((m, i) => {
    const { score, reasons } = scoreCandidate(profile, m);
    return { ...m, fitScore: Math.round((score + 0.01 * (leaves.length - i)) * 100) / 100, reasons };
  });
  scored.sort((a, b) => b.fitScore - a.fitScore);
  return keep ? scored.slice(0, keep) : scored;
}
