"""
Re-ranker determinístico por stat_fit (sem LLM).

Recebe um perfil estruturado do problema e a lista de candidatos recuperados (com stat_fit) e
reordena: filtra nós-categoria, rebaixa tipo incompatível e contraindicado, promove o melhor
encaixe. Cada candidato sai com as razões (o que casou +, o que violou -), para ser auditável.

É a implementação de referência; a mesma lógica é portada para lib/vectorSearch.ts.

Perfil esperado (o agente extrai do dataset):
    {
      "task": "classification" | "regression" | "forecasting" | ...,
      "target_type": "binary"|"multiclass"|"continuous"|"count"|"ordinal"|
                     "proportion"|"time-to-event"|"time-series"|"none",
      "n_rows": int | None,
      "n_features": int | None,
      "feature_types": ["numeric","categorical","high-cardinality categorical",
                        "text","image","graph","temporal"],
      "flags": ["overdispersion","excess_zeros","p>n","imbalanced",
                "cold_start","zero_training","needs_interpretability", ...]
    }
"""

import re

# pesos (positivos promovem, negativos rebaixam; só nó-categoria é descartado de fato)
W_TARGET_MATCH = 3.0
W_TARGET_MISMATCH = -6.0
W_TARGET_NONE = -1.0
W_FEAT_SUBSET = 2.0
W_FEAT_OVERLAP = 0.5
W_FEAT_DISJOINT = -4.0
W_REGIME_FIT = 2.0
W_REGIME_VIOLATION = -3.0
W_CONTRA_FLAG = -3.0
W_CAPABILITY = 2.0

# flag do perfil -> termos em contraindicated_when que indicam que o flag CONTRAINDICA o modelo
FLAG_TERMS = {
    "overdispersion": ["overdispersion", "variance > mean", "variance exceeds", "overdispersed"],
    "excess_zeros": ["zero-inflation", "zero inflation", "excess zeros", "many zeros", "zero inflated"],
    "p>n": ["p >> n", "p > n", "p>n", "high-dimensional", "more features than samples", "n < p"],
    "imbalanced": ["class imbalance", "imbalanced", "severe class imbalance", "rare events"],
    "needs_interpretability": ["interpretab", "inspectable model", "transparent model", "auditable model", "black box"],
}

# flag do perfil -> termos no texto positivo que indicam que o modelo PROVÊ o que o flag pede
FLAG_CAPABILITY = {
    "zero_training": ["no training", "zero-shot", "zero shot", "pretrained", "pre-trained",
                      "no per-series training", "without training", "in-context",
                      "no hyperparameter tuning", "foundation model", "amortized"],
    "cold_start": ["cold start", "cold-start", "zero-shot", "zero shot", "few-shot",
                   "no history", "new items", "new skus", "borrow"],
    "needs_interpretability": ["interpretable", "auditable", "transparent", "white box",
                               "coefficient", "feature importance", "inspectable"],
    "big_data": ["large dataset", "large datasets", "large-scale", "large scale", "millions of",
                 "tens of millions", "out-of-core", "streaming", "scalable", "scales to",
                 "big data", "high-throughput", "distributed", "1e5", "1e6", "1e7",
                 "10^5", "10^6", "10^7", "10m rows"],
}

# concatena o texto "positivo" do candidato (onde uma capacidade apareceria)
def positive_text(cand, sf):
    parts = list(cand.get("strengths") or [])
    parts += cand.get("recommendedFor") or cand.get("recommended_for") or []
    parts += cand.get("keywords") or []
    if cand.get("diffSiblings") or cand.get("diff_siblings"):
        parts.append(cand.get("diffSiblings") or cand.get("diff_siblings"))
    parts.append(str((sf.get("data_regime") or {}).get("rows") or ""))
    parts.append(str((sf.get("features") or {}).get("interpretability") or ""))
    return " ".join(parts).lower()

# leaf = id no padrão l###; categorias são slugs
def is_leaf(cand):
    return bool(re.fullmatch(r"l\d+", str(cand.get("id", ""))))

ROW_KW = re.compile(r"rows|samples|observations|examples|data ?points|sample size|dataset|\bn\b")
# comparador AMARRADO ao número (evita pegar palavras soltas como "exceeds" sem relação)
_NUM = r"~?\s*(\d[\d,\.]*)\s*([kKmM])?"
FLOOR_RE = re.compile(r"(?:\bn\s*<=?|<=?|below|under|fewer than|less than)\s*" + _NUM)
CEIL_RE = re.compile(r"(?:\bn\s*>=?|>=?|beyond|above|over|more than|exceeds|greater than)\s*" + _NUM)

def _re_val(m):
    val = float(m.group(1).replace(",", ""))
    unit = (m.group(2) or "").lower()
    if unit == "k":
        val *= 1_000
    elif unit == "m":
        val *= 1_000_000
    return val

# violação de tamanho: SÓ o contraindicated_when (semântica "ruim quando"); o data_regime
# descreve a faixa boa e tem semântica oposta, então não entra aqui. Ignora features/classes.
def row_size_violation(n, sf):
    if not n:
        return None
    text = " ".join(sf.get("contraindicated_when") or []).lower()
    # numérico: comparador colado ao número, em cláusula que fala de linhas/amostras
    for cl in re.split(r"[;.,]| and ", text):
        if not ROW_KW.search(cl):
            continue
        mc = CEIL_RE.search(cl)
        if mc and _re_val(mc) >= 50 and n > _re_val(mc):
            return ("ceiling", int(_re_val(mc)))
        mf = FLOOR_RE.search(cl)
        if mf and _re_val(mf) >= 50 and n < _re_val(mf):
            return ("floor", int(_re_val(mf)))
    # qualitativo: "very small / tiny / few samples" dentro de contraindicated => piso quando n é pequeno
    if n < 1000 and re.search(r"very small|small dataset|small data|tiny|too few|few samples|insufficient data|limited data|scarce data", text):
        return ("floor-small", None)
    if n > 100_000 and re.search(r"very large|big data|massive|large-scale", text):
        return ("ceiling-large", None)
    return None

def _statfit(cand):
    sf = cand.get("statFit") or cand.get("stat_fit") or {}
    return sf if isinstance(sf, dict) else {}

# pontua um candidato; devolve (score, reasons)
def score_candidate(profile, cand):
    sf = _statfit(cand)
    reasons = []
    score = 0.0

    # alvo
    tgt = (sf.get("target") or {}).get("types") or []
    tgt = [str(t).lower() for t in tgt]
    pt = (profile.get("target_type") or "").lower()
    if pt and tgt:
        if pt in tgt:
            score += W_TARGET_MATCH
            reasons.append(f"+target {pt}")
        elif "none" in tgt:
            score += W_TARGET_NONE
            reasons.append("~target none (umbrella/embedding)")
        else:
            score += W_TARGET_MISMATCH
            reasons.append(f"-target mismatch (model: {','.join(tgt)})")

    # features
    feats = (sf.get("features") or {}).get("types") or []
    feats = {str(f).lower() for f in feats}
    pf = {str(f).lower() for f in (profile.get("feature_types") or [])}
    if pf and feats:
        if pf <= feats:
            score += W_FEAT_SUBSET
            reasons.append("+features supported")
        elif pf & feats:
            score += W_FEAT_OVERLAP
            reasons.append("~features partial")
        else:
            score += W_FEAT_DISJOINT
            reasons.append(f"-feature type mismatch (model: {','.join(sorted(feats))})")

    # regime n: confronta SÓ limiares em contexto de linhas/amostras
    n = profile.get("n_rows")
    if n:
        viol = row_size_violation(n, sf)
        if viol:
            kind, val = viol
            score += W_REGIME_VIOLATION
            if kind == "floor":
                reasons.append(f"-n={n} below floor (~{val})")
            elif kind == "ceiling":
                reasons.append(f"-n={n} above ceiling (~{val})")
            elif kind == "floor-small":
                reasons.append(f"-contraindicated on small data (n={n})")
            else:
                reasons.append(f"-contraindicated on very large data (n={n})")
        rl = str((sf.get("data_regime") or {}).get("rows") or "").lower()
        if n <= 1000 and ("<= 1000" in rl or "< 1k" in rl or "<1k" in rl
                          or "small n" in rl or "very small" in rl or "small-to" in rl):
            score += W_REGIME_FIT
            reasons.append(f"+n={n} in model sweet spot")

    # flags: contraindicação estatística (penaliza) e capacidade operacional (premia)
    contra_txt = (" ".join(sf.get("contraindicated_when") or [])).lower()
    pos_txt = positive_text(cand, sf)
    for flag in profile.get("flags") or []:
        if any(t in contra_txt for t in FLAG_TERMS.get(flag, [])):
            score += W_CONTRA_FLAG
            reasons.append(f"-contraindicated for {flag}")
        if any(t in pos_txt for t in FLAG_CAPABILITY.get(flag, [])):
            score += W_CAPABILITY
            reasons.append(f"+supports {flag}")

    return score, reasons

# reordena: descarta nós-categoria, pontua, ordena por (score, ordem original)
def rerank(profile, candidates, keep=None):
    leaves = [c for c in candidates if is_leaf(c)]
    dropped_cat = [c.get("name") for c in candidates if not is_leaf(c)]
    scored = []
    for i, c in enumerate(leaves):
        s, reasons = score_candidate(profile, c)
        s += 0.01 * (len(leaves) - i)  # leve desempate pela ordem de recuperação
        scored.append({"name": c.get("name"), "year": c.get("year"), "id": c.get("id"),
                       "score": round(s, 2), "reasons": reasons, "raw": c})
    scored.sort(key=lambda x: x["score"], reverse=True)
    if keep:
        scored = scored[:keep]
    return {"ranked": scored, "dropped_categories": dropped_cat}
