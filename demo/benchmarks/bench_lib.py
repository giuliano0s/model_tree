"""
Biblioteca compartilhada do benchmark de "modelos ocultos".

Pergunta medida: quando o modelo ideal para um dataset é um modelo RECENTE/NICHO, os LLMs crus
o lembram sozinhos, ou esquecem? E a ferramenta (busca filtrada ao conjunto de ocultos +
re-ranker determinístico) o surfaca?

Concorrentes por nível (todos CRUS, da própria memória, sem ferramenta):
  basic    -> gemini-2.5-flash, gpt-5-mini, Claude Sonnet (subagente)
  frontier -> gemini-2.5-pro,  gpt-5,      Claude Opus  (subagente)
Ferramenta = `tool_overlooked`: busca no índice (só leitura) -> filtra ao conjunto curado de
ocultos (data/hidden_models.json) -> re-ranker por stat_fit. Espelha lib/vectorSearch.searchOverlookedModels.

Tipos de caso:
  hidden-win  -> o ideal é um oculto que os crus esqueceram (a ferramenta agrega)
  partial     -> os crus surfaçam o oculto só em parte
  tie-niche   -> achávamos oculto, mas os crus nomeiam (empate; o "oculto" não era tão oculto)
  boundary    -> resposta clássica, nenhum oculto cabe (a ferramenta concorda: nada a agregar)

Chaves (.env): GEMINI_API_KEY (ou GEMINI_ENRICH_API_KEY), OPENAI_BENCHMARK_API_KEY.
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rerank import rerank

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except ImportError:
    pass

ROOT = Path(__file__).resolve().parents[2]
API = os.getenv("MODEL_TREE_API", "https://model-tree.vercel.app/api/search")

# conjunto curado de ocultos (fonte: data/hidden_models.json)
HIDDEN = json.loads((ROOT / "data" / "hidden_models.json").read_text(encoding="utf-8"))
HIDDEN_IDS = {m["id"] for m in HIDDEN["models"]}

TIERS = {
    "basic": {"gemini": "gemini-2.5-flash", "openai": "gpt-5-mini", "claude": "claude-sonnet-4-6"},
    "frontier": {"gemini": "gemini-2.5-pro", "openai": "gpt-5", "claude": "claude-opus-4-8"},
}
PRICES = {
    "gemini-2.5-flash": (0.30, 2.50), "gemini-2.5-pro": (1.25, 10.00),
    "gpt-5-mini": (0.25, 2.00), "gpt-5": (1.25, 10.00),
}

ASK = ("You are an expert data scientist answering from your own knowledge only. Recommend the "
       "single model you would use and name it explicitly, with a short why and the key trade-off. "
       "Be concise; do not write code.\n\n")

CASES = [
    {
        "name": "classification", "kind": "hidden-win",
        "title": "Classificação tabular pequena (sem treino/tuning)",
        "target_hidden": ["TabPFN"],
        "prompt": ("A small tabular classification dataset: about 400 rows, 15 numeric features, 3 "
                   "balanced classes, clean. I want strong accuracy with essentially no training time "
                   "and no hyperparameter tuning. Which model would you use?"),
        "profile": {"task": "classification", "target_type": "multiclass", "n_rows": 400,
                    "n_features": 15, "feature_types": ["numeric"], "flags": ["zero_training"]},
        "queries": [
            "supervised multiclass classification, small clean tabular dataset a few hundred rows, "
            "continuous numeric features, p much smaller than n, gaussian class-conditional baseline",
            "small tabular classification, no hyperparameter tuning, near zero training time, zero-shot "
            "tabular foundation model, in-context learning",
        ],
    },
    {
        "name": "forecast_zeroshot", "kind": "partial",
        "title": "Forecast de milhares de séries curtas, sem treino algum",
        "target_hidden": ["TimeGPT", "Chronos"],
        "prompt": ("I must forecast demand for thousands of series, each with only a SHORT history "
                   "(about 30-60 points), and I need forecasts immediately with NO training or fitting "
                   "step at all. What approach would you use?"),
        "profile": {"task": "forecasting", "target_type": "time-series", "n_rows": None,
                    "feature_types": ["temporal"], "flags": ["zero_training", "cold_start"]},
        "queries": [
            "zero-shot time series forecasting with a pretrained foundation model, no training or "
            "fitting at all, thousands of series with short history",
            "instant probabilistic forecasting across many short series without per-series fitting, "
            "pretrained foundation model for time series",
        ],
    },
    {
        "name": "prob_regression", "kind": "tie-niche",
        "title": "Regressão tabular com distribuição preditiva calibrada (CRPS/NLL)",
        "target_hidden": ["NGBoost"],
        "prompt": ("I have a tabular regression problem (a few thousand rows, mixed numeric and "
                   "categorical features) and I need a full predictive DISTRIBUTION for each prediction "
                   "(calibrated uncertainty, not just a point estimate), optimizing something like CRPS "
                   "or negative log-likelihood. Which model would you use?"),
        "profile": {"task": "regression", "target_type": "continuous", "n_rows": 3000,
                    "n_features": 20, "feature_types": ["numeric", "categorical"], "flags": []},
        "queries": [
            "tabular regression with full predictive distribution, calibrated probabilistic prediction, "
            "optimize CRPS or negative log-likelihood, mixed features",
            "probabilistic gradient boosting outputting a distribution per prediction, uncertainty "
            "quantification for regression",
        ],
    },
    {
        "name": "causal", "kind": "tie-niche",
        "title": "Efeito causal heterogêneo a partir de dados observacionais",
        "target_hidden": ["Causal Forest", "Double ML"],
        "prompt": ("I have observational data and want to estimate the CAUSAL effect of a treatment on "
                   "an outcome, including how the effect varies across subgroups (heterogeneous treatment "
                   "effects), with many potential confounders. Which model or method would you use?"),
        "profile": {"task": "causal", "target_type": "continuous", "n_rows": 5000,
                    "feature_types": ["numeric", "categorical"], "flags": []},
        "queries": [
            "estimate heterogeneous treatment effects from observational data, conditional average "
            "treatment effect CATE, many confounders, causal machine learning",
            "causal inference with machine learning, double machine learning or causal forest, treatment "
            "effect heterogeneity, debiased orthogonal estimation",
        ],
    },
    {
        "name": "survival", "kind": "tie-niche",
        "title": "Sobrevivência com efeitos não-lineares",
        "target_hidden": ["DeepSurv"],
        "prompt": ("I have time-to-event data with right-censoring and I suspect nonlinear and "
                   "interaction effects of covariates on risk. I want individualized risk predictions. "
                   "Which model would you use?"),
        "profile": {"task": "survival", "target_type": "time-to-event", "n_rows": 2000,
                    "feature_types": ["numeric", "categorical"], "flags": []},
        "queries": [
            "survival analysis time-to-event with right censoring, nonlinear covariate effects, "
            "individualized risk prediction",
            "machine learning survival model, neural or forest based, censored time-to-event, "
            "personalized hazard",
        ],
    },
    {
        "name": "counts", "kind": "boundary",
        "title": "Contagem com excesso de zeros e superdispersão (resposta clássica)",
        "target_hidden": [],
        "prompt": ("I need to predict a count outcome (events per customer): non-negative integers, many "
                   "zeros, variance much larger than the mean, small tabular dataset with mixed numeric "
                   "and categorical features. Which model would you use?"),
        "profile": {"task": "regression", "target_type": "count", "n_rows": None,
                    "feature_types": ["numeric", "categorical"], "flags": ["overdispersion", "excess_zeros"]},
        "queries": [
            "count regression, non-negative integer target, overdispersion variance exceeds the mean, "
            "excess zeros zero-inflation, exposure offset, mixed features",
            "generalized linear model for count data, number of events per unit, zero inflated counts, "
            "two-part hurdle model",
        ],
    },
    {
        "name": "big_data_tabular", "kind": "boundary",
        "title": "Classificação tabular em big data (resposta clássica)",
        "target_hidden": [],
        "prompt": ("Predict customer churn (binary) on a big tabular dataset: about 5 million rows and "
                   "50 mixed numeric and high-cardinality categorical features. I need strong accuracy "
                   "and training that scales. Which model would you use?"),
        "profile": {"task": "classification", "target_type": "binary", "n_rows": 5_000_000,
                    "n_features": 50, "feature_types": ["numeric", "categorical", "high-cardinality categorical"],
                    "flags": ["big_data"]},
        "queries": [
            "large-scale binary classification on big tabular data, millions of rows, mixed numeric and "
            "high-cardinality categorical features, churn, scalable gradient boosting",
            "supervised classification on a huge dataset, fast training that scales to millions of "
            "samples, out-of-core, handles high-cardinality categoricals natively",
        ],
    },
]

def case_by_name(name):
    return next(c for c in CASES if c["name"] == name)

# ---------------------------------------------------------------- provedores (API)
def call_gemini(prompt, model):
    from google import genai
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_ENRICH_API_KEY")
    if not key:
        return None, None
    client = genai.Client(api_key=key)
    resp = client.models.generate_content(model=model, contents=ASK + prompt)
    um = resp.usage_metadata
    tin, ttot = um.prompt_token_count or 0, um.total_token_count or 0
    return resp.text, {"in": tin, "out": max(ttot - tin, 0), "model": model}

def call_openai(prompt, model):
    from openai import OpenAI
    key = os.getenv("OPENAI_BENCHMARK_API_KEY")
    if not key or key in ("", "..."):
        return None, None
    client = OpenAI(api_key=key)
    resp = client.chat.completions.create(model=model, messages=[{"role": "user", "content": ASK + prompt}])
    u = resp.usage
    tin, ttot = u.prompt_tokens or 0, u.total_tokens or 0
    return resp.choices[0].message.content, {"in": tin, "out": max(ttot - tin, 0), "model": model}

def cost(usage):
    p = PRICES.get(usage["model"]) if usage else None
    return None if not p else usage["in"] / 1e6 * p[0] + usage["out"] / 1e6 * p[1]

# ---------------------------------------------------------------- ferramenta (grátis): só ocultos
def search(situacao, top_k=10):
    data = json.dumps({"situacao": situacao, "topK": top_k}).encode()
    req = urllib.request.Request(API, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read()).get("modelos", [])

def multi_search(queries, per_query=20):
    seen = {}
    for q in queries:
        for c in search(q, per_query):
            cid = c.get("id")
            if cid not in seen or c.get("score", 0) > seen[cid].get("score", 0):
                seen[cid] = c
    return list(seen.values())

# espelha lib/vectorSearch.searchOverlookedModels: pool -> filtra ocultos -> re-rank
def tool_overlooked(case, keep=6):
    cands = [c for c in multi_search(case["queries"]) if c.get("id") in HIDDEN_IDS]
    out = rerank(case["profile"], cands, keep=keep)
    top = [{"name": r["name"], "year": r["year"], "fitScore": r["score"], "reasons": r["reasons"]} for r in out["ranked"]]
    hit = any(t.lower() in (r["name"] or "").lower() for r in top[:3] for t in case["target_hidden"])
    return {"ranked": top, "n_hidden_candidates": len(cands), "target_in_top3": hit}
