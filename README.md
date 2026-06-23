# 🌳 Model Tree

> A navigable taxonomy of **predictive models** across Machine Learning, Deep Learning / AI and Classical Statistics, delivered two ways: a **visual web app with an AI tutor**, and a **distributable MCP server** that recommends models for your actual dataset from inside Claude Code and other agents.

🔗 **Live app:** [model-tree.vercel.app](https://model-tree.vercel.app) · 📦 **MCP:** [`model-tree-mcp` on PyPI](https://pypi.org/project/model-tree-mcp/)

<p>
  <img alt="MCP" src="https://img.shields.io/badge/MCP-model--tree--mcp-7c3aed">
  <img alt="PyPI" src="https://img.shields.io/pypi/v/model-tree-mcp?color=3775a9&logo=pypi&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white">
  <img alt="D3" src="https://img.shields.io/badge/D3.js-7-f9a03c?logo=d3dotjs&logoColor=white">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue">
</p>

<!-- Add a screenshot/GIF here: docs/screenshot.png -->

---

## What it is

Model Tree turns a sprawling map of predictive modeling — from Linear Regression to Transformers to Bayesian hierarchical models — into a single interactive tree you can explore. Every node carries the context that's usually scattered across papers and blog posts: what makes it different from its siblings, when to use it (and when not to), its strengths, weaknesses, and a historical curiosity.

That curated knowledge powers **two products from one source**:

1. **The web app** — explore the tree visually and ask an **AI tutor** *"which model should I use for X?"* conversationally, grounded only in the taxonomy and honest about limitations.
2. **The MCP server** — a distributable package (`model-tree-mcp`) that brings the same taxonomy into Claude Code and other agents: point it at a dataset and it recommends models grounded in the data's statistics, not the LLM's fuzzy memory.

- **402 nodes** · 325 leaf models · 77 categories
- **3 main branches:** `1. Machine Learning` · `2. AI / Deep Learning` · `3. Classical Statistics`
- Fully **data-driven**: the whole visualization is computed from a single JSON. Add or rename a node and the tree, colors, sizing and layout adapt automatically.

---

## Features

### 🤖 Ask the tutor
A conversational tutor, not a search box. Describe your problem in plain language and it guides you to the right model:
- It **leads a dialogue**: asks one focused question at a time and keeps answers short, instead of dumping a wall of text. Curious by default, it lets you pull the next thread.
- When confident, it **searches the curated taxonomy semantically** and recommends the **one or two** models that fit best, grounded only in their documented **strengths, weaknesses and caveats**, then offers to go deeper.
- A **level switch** (Beginner / Basic / Advanced) tunes the depth and jargon of every answer, so the same question gets a gentle explanation or a terse expert take.
- It **teaches the problem**: when a task is ill-posed or infeasible (e.g. forecasting a brand-new fad with no history), it says so and explains what you'd actually need.
- It's **honest**: when no model is a strong fit, it leads with that instead of forcing an answer.
- The answer **streams** in, and every **model name is a clickable link** that flies to that node in the tree.

### 🔌 MCP server
The same taxonomy, usable from Claude Code and other agents through a distributable package (`model-tree-mcp`, on PyPI), in two ways:
- **`search_models` tool** — query the taxonomy for the closest models to a described situation; each result carries its full metadata, including a **statistical-fit profile** (target type and distribution, n/p regime, feature types, assumptions, supported loss, contraindications).
- **`analyze_dataset` prompt** — point it at a dataset in your project and the agent investigates the problem (target, the loss/metric you optimize), runs a quick EDA (deep on the raw data, or shallow from your prior EDA), then recommends **3-4 models with trade-offs**, grounded in the dataset's statistics and your chosen loss. Raw data never leaves your machine; the package ships zero secrets.

#### "Can't I just ask an LLM to do this?"

You can prompt an agent to run an EDA and suggest models, and it will. But a free-form LLM recommends from **fuzzy parametric memory**, with failure modes this tool removes:

- **Grounded, not guessed.** Recommendations come *only* from a curated taxonomy of 400+ models with hand-verified metadata, not from whatever the model half-remembers. Each candidate carries a structured **statistical-fit profile** (target distribution, n/p regime, assumptions, supported loss, contraindications) written specifically for model selection.
- **Covers the decision space, not the famous names.** Free-form LLMs gravitate to XGBoost and BERT and quietly skip the right classical or niche tool. The hybrid search surfaces the statistically-appropriate options (e.g. Hurdle vs Zero-Inflated vs Negative Binomial for count data with excess zeros), and the prompt forces *distinct* alternatives instead of variants of one idea.
- **Tells you when a model is wrong.** The taxonomy carries explicit **contraindications** (Poisson under overdispersion, gradient boosting under n < 1k), so you get the caveat, not just a confident suggestion.
- **Consistent and inspectable.** The same query returns the same retrieved candidates, and each links back to a node you can open in the visual tree. Free-form answers drift with phrasing and can't be audited.
- **Improves over time.** Corrections and new models added to the taxonomy reach everyone immediately; you can't patch an LLM's frozen internal knowledge.

The agent still does the EDA locally, with your tokens. The MCP just swaps the model's hazy recall for a vetted, maintained, inspectable source of model knowledge.

### 🗺️ Interactive tree
- A radial, "tree-from-above" layout rendered in SVG (D3 computes positions, React renders).
- **Zoom & pan**, plus a one-click **fit-to-view**.
- Each branch gets its own spectral palette, so families stay visually distinct. Labels wrap and stay readable on any background.

### 📋 Detail panel
Click any node for a floating panel (anchored next to it, never off-screen) with **difference from siblings**, **strengths**, **weaknesses**, **recommended / not recommended for**, **year** and a **historical curiosity**. Close with ✕, empty-space click, re-click, or **Esc**.

### 🔎 Search
Real-time and tolerant: **accent- and dash-insensitive** (e.g. `regressao` matches `Regressão`, `nbeats` matches `N-BEATS`). Filters the sidebar to matches **+ their ancestors** and dims the rest on the canvas.

### 🌐 Internationalization
Interface **and** data are localized. Built-in: **English** (default) and **Portuguese**. The language picker auto-discovers available languages from a manifest, and anyone can contribute a new one (see below).

---

## How the AI tutor works

Everything runs **serverless on free tiers**, with no server to manage:

```
you → /api/chat  → rate-limit (Upstash Redis)
                  → Gemini Flash (tool calling, streaming)
                       └─ search_models → Upstash Vector (hybrid: dense + BM25)
                  → grounded answer
```

- **Upstash Vector** stores one chunk per model with built-in embeddings (hybrid dense + keyword), queried with raw text.
- **Gemini Flash** investigates, calls the search tool once when confident, and writes the answer grounded in the returned models.
- **Upstash Redis** rate-limits by IP, protecting the vector quota and the LLM tokens.
- The **MCP** is a thin HTTP client of the public `/api/search` endpoint, so the distributed package ships **zero secrets**.

---

## Tech stack

| | |
|---|---|
| **Build / UI** | [Vite](https://vitejs.dev) + [React 18](https://react.dev) |
| **Layout** | [D3.js v7](https://d3js.org) (`hierarchy`, `zoom`) — computation only; React owns the DOM |
| **Styling** | CSS Modules + CSS custom properties (dark theme) |
| **Backend** | Vercel serverless functions (`/api`) |
| **Vector search** | [Upstash Vector](https://upstash.com/docs/vector) (hybrid, built-in embeddings) |
| **Rate limit** | [Upstash Redis](https://upstash.com/docs/redis) + `@upstash/ratelimit` |
| **LLM** | [Google Gemini](https://ai.google.dev) (Flash for chat, Pro for data enrichment) |
| **MCP server** | Python ([FastMCP](https://modelcontextprotocol.io) + httpx), published on PyPI as `model-tree-mcp` |
| **Data scripts** | Python (indexing, enrichment, translation) |

---

## Data model

Each language is one file in `data/`: `models_tree.<lang>.json`. **`models_tree.en.json` is the source of truth**; other languages are generated from it. Every node has the same shape:

```jsonc
{
  "id": "l016",                 // unique id (stable across languages)
  "name": "Lasso (L1)",
  "year": 1996,
  "diff_siblings": "…",         // how it differs from its siblings (the key field)
  "strengths": ["…"],
  "weaknesses": ["…"],
  "recommended_for": ["…"],
  "not_recommended_for": ["…"],
  "curiosity": "…",             // a historical or technical tidbit
  "children": [ /* same shape */ ]
}
```

`id`s are identical across languages, so a saved layout keeps working when you switch language.

---

## Run locally

> Requires [Node.js](https://nodejs.org) 18+.

**Frontend only** (the tree, search, layout — no AI tutor):

```bash
npm install
npm run dev      # → http://localhost:5173
```

**Full stack** (including the AI tutor) needs the serverless functions, via the Vercel CLI and the backend env vars (see `.env.example`):

```bash
npm i -g vercel
vercel dev       # serves the frontend + /api together
```

---

## Use the MCP

Add the server to your MCP client (e.g. Claude Code / Claude Desktop):

```json
{
  "mcpServers": {
    "model-tree": { "command": "uvx", "args": ["model-tree-mcp"] }
  }
}
```

Then either:
- call the **`search_models(situation, top_k)`** tool directly for a quick taxonomy lookup, or
- run the **`analyze_dataset`** prompt pointing at a dataset to get a model recommendation grounded in its statistics (the agent does the EDA locally; raw data stays on your machine).

Point it at a different deployment with the `MODEL_TREE_API` env var. Source in [`model-tree-mcp/`](model-tree-mcp/).

---

## 🌱 Contribute a model

Spotted a model that's missing? The enrichment pipeline does the heavy lifting — you give it a name, it researches the model on the web, writes a curated entry (difference from siblings, strengths, weaknesses, when to use it, a historical note, plus hidden search keywords), places it at the right spot in the tree, and translates it into every existing language.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r scripts/requirements.txt   # Windows
# (macOS/Linux: .venv/bin/python -m pip install -r scripts/requirements.txt)

# add a Gemini key to a .env file (see .env.example), then:
.venv/Scripts/python scripts/enrich_tree.py "TabPFN" "Mamba"
```

A few things worth knowing:

- **One name, one node**: each name you pass becomes a single leaf, placed under the deepest existing category that fits. Task variants of the same model (e.g. *XGBoost Classification* vs *XGBoost Regression*) and brand-new categories are added deliberately by hand, not invented by the script.
- It needs a **Gemini key** (`GEMINI_ENRICH_API_KEY`, or `GEMINI_API_KEY` as fallback) for the web-grounded generation. That's the only key a contributor needs.
- It **stops before touching the vector database.** Re-indexing requires a write token that only the maintainer holds, so the script generates and translates everything locally, then asks you to open a PR. The maintainer re-indexes on merge — you never need Upstash access.

Then commit the changed files under `data/` and open a Pull Request. That's it.

> The generated entry is a strong draft, but a quick human check on the facts (year, claims) before submitting is always welcome.

---

## 🌍 Contribute a translation

Anyone can add a language and open a Pull Request — the app picks it up automatically.

### 1. Translate the data (required)

A Python script translates the model metadata from English, in batches, with a glossary that keeps technical terms (e.g. *Random Forest*, *boosting*, *kernel*) untranslated. It uses **Gemini** by default (a `GEMINI_API_KEY` / `GEMINI_ENRICH_API_KEY`), or Cerebras with `TRANSLATE_PROVIDER=cerebras`.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r scripts/requirements.txt   # Windows
# (macOS/Linux: .venv/bin/python -m pip install -r scripts/requirements.txt)

# add your key(s) to a .env file (see .env.example), then generate e.g. Spanish:
.venv/Scripts/python scripts/translate_tree.py es                 # en -> es
```

This creates `data/models_tree.es.json` **and** registers `es` in `data/languages.json` — the language now shows up in the picker with translated content.

### 2. Translate the interface (optional)

The ~30 UI strings live in `src/i18n.jsx` under `STRINGS`. Add a table for your language code; if you skip it, the UI falls back to English while the **data** stays in your language.

### 3. Open a Pull Request

Commit the new `data/models_tree.<lang>.json`, the updated `data/languages.json`, and (optionally) your `STRINGS.<lang>` table.

> Machine translation isn't perfect on jargon — a quick human review before submitting is welcome.

---

## Project structure

```
api/                      # Vercel serverless functions: chat.ts, search.ts
lib/                      # vectorSearch.ts (shared), ratelimit.ts
data/                     # one JSON per language + languages.json + layout.json
src/
  components/             # Tree, DetailPanel, NavSidebar, SearchBar, Controls, Chat
  hooks/                  # useTreeLayout, useZoom, useSearch
  utils/                  # treeUtils, colorUtils, nodeSize
  i18n.jsx                # interface translation tables + language context
scripts/                  # Python: index_tree, enrich_tree, translate_tree
model-tree-mcp/           # distributable MCP package (HTTP client, no secrets)
```

---

## 🧭 Roadmap

- **More languages** (the pipeline is ready — contributions welcome).
- **Grow the taxonomy** as new models appear, with help from the community via the enrichment pipeline (see [Contribute a model](#-contribute-a-model)).

---

## License

[MIT](LICENSE) © Giuliano de Souza
