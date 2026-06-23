# Demo datasets — model-tree MCP

Three small datasets of increasing complexity to try the [`model-tree`](https://pypi.org/project/model-tree-mcp/) MCP. Each one has a different statistical profile, so the recommendation lands on a different model family.

## Setup

1. Add the MCP to your agent (Claude Code / Claude Desktop):
   ```json
   {
     "mcpServers": {
       "model-tree": { "command": "uvx", "args": ["model-tree-mcp"] }
     }
   }
   ```
2. You need `pandas` available in your Python kernel — the agent reads the data with it. The raw data never leaves your machine.

## Two modes

The recommendation runs in one of two modes (the agent asks which):

- **Deep** — the agent reads the raw CSV and profiles it on the spot.
- **Shallow** — the agent reads an EDA you already did (a notebook with executed outputs) and infers the profile from it, without re-reading the raw data.

You can trigger it with the `analyze_dataset` prompt, or just ask naturally and point at a file. Either way, mention the **loss/metric** you care about (RMSE, MAE, quantile, log-loss…) — the tutor uses it as a tie-breaker.

## The cases

### 1. `iris.csv` — multiclass classification (deep)

Clean, 150 rows, 3 balanced species, 4 numeric features.

> Analyze `demo/iris.csv` and recommend models. The target is `species`.

Expect a spread like LDA/QDA, logistic regression, SVM, random forest.

### 2. `insurance_charges.csv` + `02_insurance.ipynb` — regression (shallow)

`02_insurance.ipynb` already contains an executed EDA, so this is the case for **shallow** mode.

> Analyze `demo/02_insurance.ipynb` using the existing EDA and recommend models for predicting `charges`. I care about MAE.

Expect a positive-skewed regression answer: Gamma GLM, gradient boosting (CatBoost/XGBoost), with the n=500 caveat.

### 3. `support_tickets.csv` — count with excess zeros (deep)

800 rows, ~58% zeros, overdispersion, missing values, and a high-cardinality categorical (`city`).

> Analyze `demo/support_tickets.csv` and recommend models. The target is `support_tickets` (a count).

Expect the count-with-zeros family: Negative Binomial, Zero-Inflated Poisson, Hurdle — distinct options, not variants of one.
