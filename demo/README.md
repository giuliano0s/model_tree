# Demo datasets — model-tree MCP

Three small datasets to try the [`model-tree`](https://pypi.org/project/model-tree-mcp/) MCP. The MCP does **one thing**: given your dataset profile, it surfaces the **recent/niche models you would overlook** (`find_overlooked_models`). The standard, well-known answer comes from the agent's own knowledge — the tool only adds the model the LLM tends to forget, and says nothing when there is none. These three cases show both: one where the overlooked model is the win, two where the classical answer is right and the tool honestly adds nothing.

## Setup

> **Status:** the `model-tree-mcp` package is currently **yanked** on PyPI (`uvx model-tree-mcp` will not resolve). Run it from source in this repo (`model-tree-mcp/`) to try it. See [benchmarks/](benchmarks/README.md) for why.

1. Add the MCP to your agent (Claude Code / Claude Desktop):
   ```json
   {
     "mcpServers": {
       "model-tree": { "command": "uvx", "args": ["model-tree-mcp"] }
     }
   }
   ```
2. You need `pandas` (or DuckDB/Polars for big data) in your Python kernel — the agent reads the data with it. The raw data never leaves your machine; only the aggregate profile is sent.

## How a recommendation goes

Run the `analyze_dataset` prompt (or just ask naturally and point at a file). The agent:

1. **Profiles the data** — *deep* reads the raw CSV and profiles it; *shallow* reads an EDA you already did (a notebook with executed outputs) and infers from it. For big data it aggregates or samples, never loads everything.
2. **Gives the standard pick from its own knowledge** — the well-known answer for the profile.
3. **Checks `find_overlooked_models`** — the recent/niche models that fit and that it might have forgotten; includes one only if it genuinely beats or complements the standard pick.

Mention the **loss/metric** you care about (RMSE, MAE, quantile, log-loss, CRPS) — it is a tie-breaker.

## The cases

### 1. `iris.csv` — small tabular classification (deep) — *where the tool wins*

Clean, 150 rows, 3 balanced species, 4 numeric features.

> Analyze `demo/iris.csv` and recommend models. The target is `species`. I want strong accuracy with no tuning.

- **Standard pick (the agent, from memory):** LDA / QDA, logistic regression, SVM, random forest.
- **Overlooked check (the tool):** **TabPFN** — a tabular foundation model purpose-built for small, no-tuning classification that frontier and mid-tier LLMs alike skip cold. This is the case where the tool genuinely adds something.

### 2. `insurance_charges.csv` + `02_insurance.ipynb` — regression (shallow) — *classical answer is right*

`02_insurance.ipynb` already contains an executed EDA, so this is the case for **shallow** mode. Positive-skewed `charges`, n=500.

> Analyze `demo/02_insurance.ipynb` using the existing EDA and recommend models for predicting `charges`. I care about MAE.

- **Standard pick:** Gamma GLM (log link), gradient boosting (CatBoost/XGBoost), with the n=500 caveat — the agent knows these.
- **Overlooked check:** little to add. NGBoost only if you specifically want a calibrated predictive distribution; otherwise the tool surfaces nothing compelling, and the classical answer stands.

### 3. `support_tickets.csv` — count with excess zeros (deep) — *classical answer is right*

800 rows, ~58% zeros, overdispersion, missing values, a high-cardinality categorical (`city`).

> Analyze `demo/support_tickets.csv` and recommend models. The target is `support_tickets` (a count).

- **Standard pick:** the count-with-zeros family — Negative Binomial, Zero-Inflated, Hurdle — which any competent LLM names cold.
- **Overlooked check:** **none.** No recent/niche model in the curated set fits count regression better than the classics, and the tool says so rather than inventing one.

---

The honest takeaway, matching [benchmarks/](benchmarks/README.md): the MCP earns its keep on case 1 (a genuinely overlooked model) and is redundant on 2-3 (the LLM already gives the right classical answer). Its durable value is currency — surfacing models newer than the LLM's training cutoff.
