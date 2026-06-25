"""
model-tree MCP server.

Purpose: surface the OVERLOOKED model. Any capable LLM already knows the standard, well-known
answer for a dataset (linear/logistic regression, random forest, XGBoost, ARIMA, the count GLMs).
What it reliably FORGETS are recent or niche purpose-built models (TabPFN, TimeGPT, Chronos,
PatchTST, NGBoost, Causal Forest, DeepSurv, ...). This tool exists to catch exactly those: given a
dataset profile, it returns the recent/niche models that FIT and that the caller's own reasoning
would likely miss, ranked by statistical fit, with auditable reasons.

It is a thin HTTP client of the public /api/search endpoint. It reads no data and holds no secrets;
the raw dataset never leaves the machine (the AGENT profiles it locally; only the aggregate profile
is sent).

Client config:
    "model-tree": { "command": "uvx", "args": ["model-tree-mcp"] }

The endpoint URL can be overridden with the MODEL_TREE_API env var.
"""

import os
import httpx
from mcp.server.fastmcp import FastMCP

ENDPOINT = os.environ.get(
    "MODEL_TREE_API",
    "https://model-tree.vercel.app/api/search",
)

mcp = FastMCP("model-tree")


@mcp.tool()
def find_overlooked_models(situation: str, profile: dict | None = None, top_k: int = 6) -> list[dict]:
    """Surface RECENT / NICHE models that fit the dataset and that you would likely overlook.

    Use this AFTER you already have your own standard recommendation. It does NOT return the
    well-known classics (you know those) — it returns the overlooked, purpose-built models from a
    curated set (e.g. TabPFN for small tabular, TimeGPT/Chronos for forecasting, NGBoost for
    probabilistic regression, Causal Forest / Double ML for causal effects, DeepSurv for survival),
    filtered to the ones that actually fit the profile and ranked by statistical fit.

    Pass an ENGLISH `situation` enriched with technical vocabulary (task, target distribution, n/p
    regime, feature types, desired loss) AND a structured `profile` so the server can rank by fit.

    profile schema (fill what the EDA determined; flags must be OBJECTIVE properties of the problem,
    not loose interpretations):
        {
          "task": "classification" | "regression" | "forecasting" | "survival" | "causal" | ...,
          "target_type": "binary" | "multiclass" | "continuous" | "count" | "ordinal" |
                         "proportion" | "time-to-event" | "time-series" | "none",
          "n_rows": int,
          "n_features": int,
          "feature_types": ["numeric","categorical","high-cardinality categorical",
                            "text","image","graph","temporal"],
          "flags": ["overdispersion","excess_zeros","p>n","imbalanced",
                    "cold_start","zero_training","needs_interpretability","big_data"]
        }

    Each returned model carries its fields (diff_siblings, strengths, weaknesses, recommended_for,
    not_recommended_for, keywords), its `stat_fit`, and a `fitScore` + `reasons` (the auditable
    + / - signals). RESPECT each candidate's caveats: a high fitScore still loses if its
    `not_recommended_for` / `contraindicated_when` rules out your dataset.

    Returns an empty-ish list when no overlooked model fits — that is a valid, honest answer
    meaning "your standard pick is the right call here".

    Args:
        situation: technical English description of the problem/data/constraints.
        profile: structured profile of the dataset (strongly recommended; enables ranking).
        top_k: how many overlooked candidates to return (default 6).
    """
    body: dict = {"situacao": situation, "topK": top_k, "hidden": True}
    if profile:
        body["profile"] = profile
    resp = httpx.post(ENDPOINT, json=body, timeout=30)
    resp.raise_for_status()
    return resp.json().get("modelos", [])


@mcp.prompt()
def analyze_dataset(data_path: str = "") -> str:
    """Recommend predictive models for a local dataset, catching the overlooked ones.

    Profiles the dataset (deterministically where possible), gives the standard recommendation from
    your own knowledge, then checks for recent/niche models you may have missed via
    find_overlooked_models, and decides honestly whether any of them fits better.
    """
    target = data_path or "the data file/directory indicated by the user"
    return f"""You are a senior data-science tutor choosing predictive models for a real dataset. The data is at: {target}.

The premise: you already know the standard, well-documented models. The one thing you (like any LLM) reliably FORGET are recent or niche purpose-built models. The `find_overlooked_models` tool exists to catch those. Work conversationally; never dump everything at once.

PHASE 1 — INVESTIGATE (one decisive question at a time, wait for the answer):
- Which column is the TARGET (or is this unsupervised / causal / survival)?
- What LOSS / METRIC matters (RMSE, MAE, quantile, log-loss, AUC, CRPS, business cost)? Tie-breaker later.
- DEEP or SHALLOW analysis? Deep = I profile the raw data now. Shallow = I read the user's prior EDA artifacts.

PHASE 2 — EDA (your own tools; the raw data NEVER leaves the machine):
- Profile: target type and empirical distribution; n rows and n features; feature types; missingness; class balance; relevant moments only where they inform the choice; derivable features (dates -> lags, text -> embeddings).
- For BIG DATA that does not fit in memory, the rule is: NEVER load all rows — compute the profile from AGGREGATES or a representative sample. Use whatever is available: a lazy/columnar engine (DuckDB or Polars) for a one-pass scan if present, otherwise pandas in chunks or a random sample. Install a fast engine only if the environment allows; do not depend on it.
- Summarize the profile briefly before recommending.

PHASE 3 — STANDARD PICK (from your own knowledge):
- State the standard, well-known recommendation(s) for this profile, with trade-offs. You do not need the tool for these; you already know them (linear/logistic regression, random forest, XGBoost/LightGBM, ARIMA, the count GLMs, etc.).

PHASE 4 — CHECK FOR OVERLOOKED MODELS (the tool):
- Build a STRUCTURED `profile` (task, target_type, n_rows, n_features, feature_types, flags). Set a flag ONLY if it is an OBJECTIVE property of the problem (e.g. overdispersion because variance >> mean; big_data because n is in the millions; zero_training ONLY if the user literally needs no training at all — "no per-series training" is NOT zero_training). Loose flags produce wrong rankings.
- Call `find_overlooked_models(situation=..., profile=...)` ONCE. It returns recent/niche models that fit, with `fitScore` + `reasons`.
- For each returned candidate, judge it on the MERITS against your standard pick, RESPECTING its caveats (`not_recommended_for` / `contraindicated_when`): a recent model is not automatically better. Often nothing overlooked beats the standard answer — say so plainly. Sometimes one genuinely fits better (e.g. TabPFN on small tabular with no tuning) — then surface it.

PHASE 5 — RECOMMEND 2-4 distinct models with trade-offs:
- Ground ONLY in your standard knowledge + the returned candidates and their fields. Lead with the best fit; include a recent/niche option only when it genuinely fits; flag contraindications. Be honest: if the standard answer is the right call and nothing overlooked improves it, say exactly that. End by offering to go deeper.

LANGUAGE: reply in the language the user writes in; default to English. Keep model/library/metric names in their conventional (English) form."""


def main():
    mcp.run()


if __name__ == "__main__":
    main()
