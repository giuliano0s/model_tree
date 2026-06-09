# 🌳 Model Tree

> An interactive, navigable taxonomy of **365 predictive models** across Machine Learning, Deep Learning / AI, and Classical Statistics — with rich metadata for every model.

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

- **365 nodes** · 297 leaf models · 68 categories
- **3 main branches:** `1. Machine Learning` · `2. AI / Deep Learning` · `3. Classical Statistics`
- Fully **data-driven**: the whole visualization is computed from a single JSON — add or rename a node and the tree, colors, sizing and layout adapt automatically.

---

## Features

### 🗺️ Interactive tree
- A radial, "tree-from-above" layout rendered in SVG (D3 computes positions, React renders).
- **Zoom & pan**, plus a one-click **fit-to-view**.
- Color system where each branch gets its own spectral palette, so families are visually distinct. Labels wrap to multiple lines and stay readable on any background (white text with a dark outline).

### 📋 Detail panel
Click any node to open a floating panel (anchored next to it, never off-screen) with:
- **Difference from siblings** — the key distinction at that level
- **Strengths** and **weaknesses**
- **Recommended for** / **Not recommended for**
- **Year** and a **historical curiosity**

Close it with the ✕, by clicking empty space, by clicking the node again, or with **Esc**.

### 🔎 Search
- Real-time, **accent-insensitive** (e.g. `regressao` matches `Regressão`).
- Filters the sidebar down to matches **+ their ancestors** (keeping context) and dims non-matching nodes on the canvas.

### 🧭 Navigation sidebar
- A collapsible tree that mirrors the hierarchy.
- Click any item to **fly to the node** (smooth zoom) and open its detail panel.
- Collapse the whole tray to give the canvas full width.

### ✋ Custom layout (saved per user)
- **Drag a node** to move it together with its whole subtree.
- **Drag a branch** to reshape its curve.
- **Save layout** → your arrangement is stored in your browser (`localStorage`) and restored on every visit.
- **Reset** → back to your last saved arrangement.
- **Restore default** → discard your changes and return to the project's default layout.

### 🌐 Internationalization
- Interface **and** data are localized. Built-in: **English** (default) and **Portuguese**.
- Language picker auto-discovers available languages from a manifest — no hardcoded list.
- New languages can be contributed by anyone (see below).

### ☁️ Zero backend
100% static — no server, no database. Deploys for free on Vercel (or any static host).

---

## Tech stack

| | |
|---|---|
| **Build** | [Vite](https://vitejs.dev) |
| **UI** | [React 18](https://react.dev) |
| **Layout & interaction** | [D3.js v7](https://d3js.org) (`hierarchy`, `zoom`) — used for **computation only**; React owns the DOM |
| **Styling** | CSS Modules + CSS custom properties (dark theme) |
| **Translations** | Python + the [Cerebras](https://cerebras.ai) API (free tier) |

---

## Data model

Each language is a single file in `data/`: `models_tree.<lang>.json` (with `models_tree.pt.json` as the source of truth). Every node has the same shape:

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

Because `id`s are identical across languages, your saved layout keeps working when you switch language.

---

## Run locally

> Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run dev      # → http://localhost:5173
```

Build for production:

```bash
npm run build    # outputs to dist/
npm run preview  # preview the production build
```

---

## 🌍 Contribute a translation

Anyone can add a language and open a Pull Request — the app picks it up automatically.

There are two layers, and **only the first is required**:

### 1. Translate the data (required)

A Python script translates the model metadata using the Cerebras API (free tier), in batches, with a glossary that keeps technical terms (e.g. *Random Forest*, *boosting*, *kernel*) untranslated.

```bash
# one-time setup
python -m venv .venv
.venv/Scripts/python -m pip install -r scripts/requirements.txt   # Windows
# (macOS/Linux: .venv/bin/python -m pip install -r scripts/requirements.txt)

# add your Cerebras key (free at cloud.cerebras.ai) to a .env file:
#   CEREBRAS_API_KEY=...

# generate, e.g. Spanish (pt -> es):
.venv/Scripts/python scripts/translate_tree.py es
```

This creates `data/models_tree.es.json` **and** registers `es` in `data/languages.json`. That's it — the language now shows up in the picker with translated content.

Useful env vars: `CEREBRAS_MODEL`, `BATCH_SIZE`, `REQUEST_INTERVAL` (see the script's header for details).

### 2. Translate the interface (optional)

The ~30 UI strings (buttons, panel headings) live in `src/i18n.jsx` under `STRINGS`. Add a table for your language code; if you skip this, the UI falls back to English while the **data** stays in your language.

### 3. Open a Pull Request

Commit the new `data/models_tree.<lang>.json`, the updated `data/languages.json`, and (optionally) your `STRINGS.<lang>` table, then open a PR. Once merged, the language is live for everyone.

> Machine translation isn't perfect on technical jargon — a quick human review of the generated file before submitting is very welcome.

---

## Project structure

```
data/                      # one JSON per language + languages.json manifest + layout.json
src/
  components/              # Tree (Node, Link), DetailPanel, NavSidebar, SearchBar, Controls
  hooks/                  # useTreeLayout, useZoom, useSearch
  utils/                  # treeUtils, colorUtils, nodeSize
  i18n.jsx                # interface translation tables + language context
scripts/
  translate_tree.py       # Cerebras-powered translation generator
```

---

## 🧭 Roadmap

### Embeddings & a vector knowledge base for real projects

The richest part of this project isn't the tree — it's the **curated metadata** on each of the 365 models (when to use it, when not to, trade-offs, differences from siblings). The next step is to make that knowledge **queryable by meaning**, so it can plug into real ML/AI work:

1. **Embed the data.** Turn each node into one or more text chunks (name + `diff_siblings` + strengths/weaknesses + recommended/not-recommended + curiosity) and compute vector embeddings for them.
2. **Store in a vector database.** Index the embeddings (e.g. [pgvector](https://github.com/pgvector/pgvector), [Qdrant](https://qdrant.tech), [Chroma](https://www.trychroma.com) or FAISS), keeping each model's `id`, branch and metadata as payload.
3. **Expose it as semantic search / a retrieval API.** Ask in natural language — *"imbalanced tabular data, few labels, needs interpretability"* — and get back the most relevant models **with their strengths, weaknesses and caveats**, instead of just a name.
4. **Use it as a RAG layer for an assistant.** Ground an LLM "which model should I use?" helper on this curated taxonomy, so recommendations come with honest trade-offs and are traceable back to a node in the tree (which the app can then highlight).

The goal: turn the visualization into a **decision-support tool** — a model-selection copilot backed by a structured, human-reviewed knowledge base rather than generic web text.

Because the data is already clean, multilingual and `id`-stable, it's a natural source corpus for this: the same JSON that renders the tree becomes the corpus that feeds the vector store.

> Contributions toward this (an `embed` script, a small retrieval service, or a notebook demo) are welcome.

---

## License

[MIT](LICENSE) © Giuliano de Souza
