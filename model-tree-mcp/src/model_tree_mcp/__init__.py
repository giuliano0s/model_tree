"""
model-tree MCP server.

Exposes two things to the client (Claude Code, etc.):

- tool `search_models`: queries the public /api/search endpoint and returns the closest
  models to a described situation, each with its metadata (including `stat_fit`, the
  statistical-fit profile used to match a model to a dataset).
- prompt `analyze_dataset`: orchestrates a dataset-grounded recommendation. The reasoning
  (investigation + EDA) runs in the AGENT, on the user's tokens; the raw data never leaves
  the machine. The package itself reads no data and holds no secrets.

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
def search_models(situation: str, top_k: int = 8) -> list[dict]:
    """Search the taxonomy for the predictive models closest to a situation.

    Pass an ENGLISH description enriched with technical vocabulary (task, target
    distribution, n/p regime, feature types, desired loss/metric), not the user's
    raw words: this widens recall.

    Each returned model carries its fields (diff_siblings, strengths, weaknesses,
    recommended_for, not_recommended_for, keywords) and `stat_fit` (statistical-fit
    profile: target type/distribution, data regime, feature types, assumptions,
    supported loss, contraindications). Use `stat_fit` and the desired loss to judge
    how well each candidate fits the dataset.

    Args:
        situation: technical English description of the problem/data/constraints.
        top_k: how many candidates to return (default 8; pick 3-4 final ones).
    """
    resp = httpx.post(
        ENDPOINT,
        json={"situacao": situation, "topK": top_k},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("modelos", [])


@mcp.prompt()
def analyze_dataset(data_path: str = "") -> str:
    """Recommend predictive models by analyzing a local dataset.

    Investigates the problem, runs an EDA (deep or shallow), searches the taxonomy,
    and recommends 3-4 models with trade-offs, grounded in the dataset's statistics.
    """
    target = data_path or "the data file/directory indicated by the user"
    return f"""You are a senior data-science tutor helping choose predictive models for a real dataset. The data is at: {target}.

Work conversationally, like a tutor — never dump everything at once. Follow these phases:

PHASE 1 — INVESTIGATE (one decisive question at a time, wait for the answer):
- Which column is the TARGET (or is this unsupervised)?
- What LOSS / METRIC matters to the user (e.g. RMSE, MAE, quantile/pinball, log-loss, AUC, CRPS, business cost)? This is a tie-breaker later.
- DEEP or SHALLOW analysis? Deep = I read the raw data and profile it now. Shallow = I read the user's prior EDA artifacts (notebooks, profiling reports) and infer from them.
Do not ask all three as a list; ask the most decisive one first and adapt.

PHASE 2 — EDA (you do this with your own tools; the raw data NEVER leaves the machine):
- DEEP: read the data at the path, then profile: target type (continuous / count / binary / multiclass / ordinal / proportion / time-to-event / time-series) and its empirical distribution (e.g. looks Poisson, heavy-tailed, bimodal); n rows and n features; feature types (numeric / categorical incl. high-cardinality / text / image / temporal); missingness; class balance; relevant moments (mean/median/variance) only where they inform the choice; and which features could be DERIVED (dates → seasonality/lags, text → embeddings).
- SHALLOW: locate and read the user's existing EDA outputs and extract the same profile from them; state what you could not determine.
- Summarize the profile back to the user briefly before recommending.

PHASE 3 — SEARCH:
- Call the tool `search_models` ONCE with a concise ENGLISH query enriched from the profile (task + target distribution + n/p regime + feature types + desired loss), not the user's raw words.

PHASE 4 — RECOMMEND 3-4 models with trade-offs:
- Ground every recommendation ONLY in the returned candidates and their fields, especially each candidate's `stat_fit` (target/distribution, data regime, feature types, assumptions, supported `loss`, contraindications). Do not invent models.
- Match against the profile AND the user's loss: a candidate that does not support the desired loss is a weaker fit even if otherwise suitable (e.g. quantile loss → quantile regression or gradient boosting with a quantile objective; calibrated uncertainty / CRPS → probabilistic models like NGBoost).
- The 3-4 models MUST be meaningfully DISTINCT options that span the decision space, not variants of the same approach (e.g. for count data with excess zeros: a Negative Binomial baseline, a Zero-Inflated model, and a Hurdle model — NOT ZIP and ZINB, which are the same family).
- Lead with the best fit for the task at the current state of the art; keep valid classics (linear/logistic regression, random forest, ARIMA) as first-class when they fit; flag when a candidate is contraindicated for this dataset (e.g. overdispersed counts → negative binomial over Poisson; tiny n → avoid heavy deep models).
- For each: one line on WHY it fits this profile + its key trade-off. End by offering to go deeper on any of them.
- Be honest: if the dataset is ill-posed or no candidate truly fits, say so and explain what would be needed.

LANGUAGE: reply in the language the user writes in; default to English. Keep proper names of models, libraries and metrics in their conventional (English) form."""


def main():
    mcp.run()


if __name__ == "__main__":
    main()
