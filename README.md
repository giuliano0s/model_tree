# 🌳 Model Tree

> An interactive, navigable taxonomy of **predictive models** across Machine Learning, Deep Learning / AI and Classical Statistics, plus an **AI tutor** that guides you to the right model for your problem, grounded in that taxonomy.

🔗 **Live app:** [model-tree.vercel.app](https://model-tree.vercel.app)

<p>
  <img alt="React" src="https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white">
  <img alt="D3" src="https://img.shields.io/badge/D3.js-7-f9a03c?logo=d3dotjs&logoColor=white">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue">
</p>

<!-- Add a screenshot/GIF here: docs/screenshot.png -->

---

## What it is

Model Tree turns a sprawling map of predictive modeling — from Linear Regression to Transformers to Bayesian hierarchical models — into a single interactive tree you can explore. Every node carries the context that's usually scattered across papers and blog posts: what makes it different from its siblings, when to use it (and when not to), its strengths, weaknesses, and a historical curiosity.

On top of that curated knowledge, an **AI tutor** answers *"which model should I use for X?"* conversationally, adapting to your level, grounded only in the taxonomy and honest about limitations.

- **392 nodes** · 316 leaf models · 76 categories
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

### 🗺️ Interactive tree
- A radial, "tree-from-above" layout rendered in SVG (D3 computes positions, React renders).
- **Zoom & pan**, plus a one-click **fit-to-view**.
- Each branch gets its own spectral palette, so families stay visually distinct. Labels wrap and stay readable on any background.

### 📋 Detail panel
Click any node for a floating panel (anchored next to it, never off-screen) with **difference from siblings**, **strengths**, **weaknesses**, **recommended / not recommended for**, **year** and a **historical curiosity**. Close with ✕, empty-space click, re-click, or **Esc**.

### 🔎 Search
Real-time and tolerant: **accent- and dash-insensitive** (e.g. `regressao` matches `Regressão`, `nbeats` matches `N-BEATS`). Filters the sidebar to matches **+ their ancestors** and dims the rest on the canvas.

### 🧭 Navigation sidebar
A collapsible mirror of the hierarchy. Click an item to **fly to the node** and open its panel. Collapse the tray for full-width canvas.

### ✋ Custom layout (saved per user)
**Drag a node** to move its whole subtree, **drag a branch** to reshape its curve, **Save** to your browser, **Reset** to your last save, **Restore default** to the project's layout.

### 🌐 Internationalization
Interface **and** data are localized. Built-in: **English** (default) and **Portuguese**. The language picker auto-discovers available languages from a manifest, and anyone can contribute a new one (see below).

### 🔌 MCP server
A distributable [MCP](https://modelcontextprotocol.io) package (`model-tree-mcp`) lets Claude and other agents query the taxonomy as a tool, returning the closest models for a described situation.

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

The tool `buscar_modelo(situacao, top_k)` returns the closest models for a described situation. Point it at a different deployment with the `MODEL_TREE_API` env var. Source in [`model-tree-mcp/`](model-tree-mcp/).

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

- **Publish the MCP to PyPI** so `uvx model-tree-mcp` works out of the box.
- **More languages** (the pipeline is ready — contributions welcome).
- **Grow the taxonomy** via the enrichment pipeline (`scripts/enrich_tree.py`): give it model names and it researches each on the web, recognizes multi-task models and splits them into per-task variants (e.g. *XGBoost* → classification + regression), places each at the deepest fitting branch (creating an intermediate category when the right sibling group is missing), then translates and reindexes.

---

## License

[MIT](LICENSE) © Giuliano de Souza
