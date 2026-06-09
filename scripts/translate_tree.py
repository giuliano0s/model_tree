"""
Traduz a árvore de modelos entre idiomas usando Cerebras (llama3.1-8b) via OpenAI SDK.

Gera arquivos estáticos por idioma: data/models_tree.<dst>.json
(o master em PT é data/models_tree.json).

Estratégia:
- 1 chamada por nó: manda os campos de texto como JSON e pede JSON traduzido de
  volta (o nó inteiro dá contexto → tradução mais consistente).
- Glossário + regras no system prompt: NÃO traduz nomes próprios de algoritmos/
  bibliotecas e mantém o jargão técnico na forma convencional.
- Cache incremental por idioma (scripts/translations.<dst>.json): retoma se parar.
- Montagem do arquivo final só no fim → JSON sempre válido.

Uso:
    export CEREBRAS_API_KEY=...          # PowerShell: $env:CEREBRAS_API_KEY="..."
    pip install openai
    python scripts/translate_tree.py <dst> [src]
        <dst> idioma destino (default: en)
        [src] idioma origem  (default: pt)

Exemplos:
    python scripts/translate_tree.py en        # pt -> en
    python scripts/translate_tree.py es        # pt -> es
    python scripts/translate_tree.py fr en     # en -> fr (usa models_tree.en.json como fonte)
"""

import json
import os
import re
import sys
import time
import copy
from pathlib import Path
from openai import OpenAI

# carrega .env da raiz do projeto (se python-dotenv estiver instalado)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

# ---------------------------------------------------------------- idiomas
SRC_LANG = sys.argv[2] if len(sys.argv) > 2 else "pt"
DST_LANG = sys.argv[1] if len(sys.argv) > 1 else "en"

# nomes em inglês (para o prompt)
LANG_NAMES = {
    "pt": "Portuguese", "en": "English", "es": "Spanish",
    "fr": "French", "de": "German", "it": "Italian",
}
# autônimos (nome do idioma nele mesmo, para o dropdown via manifesto)
AUTONYMS = {
    "pt": "Português", "en": "English", "es": "Español",
    "fr": "Français", "de": "Deutsch", "it": "Italiano",
}

# ---------------------------------------------------------------- caminhos
ROOT = Path(__file__).resolve().parent.parent
# fonte: models_tree.<src>.json (master PT = models_tree.pt.json)
SRC = ROOT / "data" / f"models_tree.{SRC_LANG}.json"
if not SRC.exists():
    SRC = ROOT / "data" / "models_tree.pt.json"
OUT      = ROOT / "data" / f"models_tree.{DST_LANG}.json"
CACHE    = ROOT / "scripts" / f"translations.{DST_LANG}.json"
MANIFEST = ROOT / "data" / "languages.json"

# ---------------------------------------------------------------- config
# modelos disponíveis na Cerebras: gpt-oss-120b, zai-glm-4.7
# (override com a env var CEREBRAS_MODEL, ex: CEREBRAS_MODEL=gpt-oss-120b)
MODEL = os.getenv("CEREBRAS_MODEL", "zai-glm-4.7")

# limite free tier ≈ 5 req/min e 30k tokens/min → traduzimos em LOTES de nós por
# request e respeitamos um intervalo mínimo entre requests.
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "5"))
REQUEST_INTERVAL = float(os.getenv("REQUEST_INTERVAL", "12.5"))  # seg entre requests (~5/min)

# campos de texto a traduzir (id, year, children ficam intactos)
STR_FIELDS  = ["name", "diff_siblings", "curiosity"]
LIST_FIELDS = ["strengths", "weaknesses", "recommended_for", "not_recommended_for"]
ALL_FIELDS  = STR_FIELDS + LIST_FIELDS

# termos que permanecem em inglês (nomes próprios e jargão consagrado)
GLOSSARY = [
    "Random Forest", "Gradient Boosting", "XGBoost", "LightGBM", "CatBoost",
    "AdaBoost", "Extra Trees", "Decision Tree", "K-Means", "K-Medoids", "DBSCAN",
    "HDBSCAN", "OPTICS", "Mean Shift", "PCA", "ICA", "SVD", "t-SNE", "UMAP",
    "Isomap", "LLE", "MDS", "Lasso", "Ridge", "ElasticNet", "SVM", "SVR",
    "Naive Bayes", "LDA", "QDA", "KNN", "Perceptron", "MLP", "CNN", "RNN", "LSTM",
    "GRU", "Transformer", "BERT", "GPT", "ViT", "Swin", "DETR", "CLIP", "Mamba",
    "GAN", "VAE", "Autoencoder", "GCN", "GAT", "GraphSAGE", "ARIMA", "SARIMA",
    "GARCH", "Prophet", "Kalman", "boosting", "bagging", "stacking", "ensemble",
    "kernel", "embedding", "overfitting", "dropout", "attention", "fine-tuning",
    "LoRA", "RAG", "kriging", "softmax", "ReLU",
]

SRC_NAME = LANG_NAMES.get(SRC_LANG, SRC_LANG)
DST_NAME = LANG_NAMES.get(DST_LANG, DST_LANG)

SYSTEM = (
    f"You are a professional translator specialized in machine learning, deep "
    f"learning and statistics. Translate the VALUES of the given JSON object from "
    f"{SRC_NAME} to {DST_NAME}.\n"
    "Rules:\n"
    "1. The input is a JSON object mapping node ids to objects of text fields. Keep "
    "every id and every field key EXACTLY the same (ids are codes — never translate "
    "them); translate ONLY the string values.\n"
    "2. Lists must keep the same number of items, in the same order.\n"
    "3. Use the conventional form of technical terms in the target language. Do NOT "
    "translate proper names of algorithms, libraries, models or methods.\n"
    "4. Keep acronyms, numbers, years, citations and author names unchanged.\n"
    "5. The following terms must stay in English regardless of their capitalization "
    "in the source (match them case-insensitively, but keep each occurrence's own "
    "casing): " + ", ".join(GLOSSARY) + ".\n"
    "6. Return ONLY the JSON object, with no extra text, no markdown fences."
)

client = OpenAI(api_key=os.getenv("CEREBRAS_API_KEY"), base_url="https://api.cerebras.ai/v1")


# ---------------------------------------------------------------- helpers
def load_json(path, default=None):
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def flatten(node, acc):
    acc.append(node)
    for c in node.get("children", []):
        flatten(c, acc)
    return acc


def extract_fields(node):
    out = {}
    for k in ALL_FIELDS:
        if k in node and node[k] not in (None, "", []):
            out[k] = node[k]
    return out


def parse_json_loose(s):
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?", "", s).strip()
        s = re.sub(r"```$", "", s).strip()
    return json.loads(s)


def valid_shape(src, out):
    if not isinstance(out, dict):
        return False
    for k, v in src.items():
        if k not in out:
            return False
        if isinstance(v, list) and (not isinstance(out[k], list) or len(out[k]) != len(v)):
            return False
    return True


def translate_batch(batch, max_retries=8):
    """batch: dict id -> fields. Retorna dict id -> fields traduzidos (ou None)."""
    payload = json.dumps(batch, ensure_ascii=False)
    for attempt in range(max_retries):
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                temperature=0.2,
                messages=[
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": payload},
                ],
            )
            out = parse_json_loose(resp.choices[0].message.content)
            if isinstance(out, dict) and all(
                nid in out and valid_shape(fields, out[nid]) for nid, fields in batch.items()
            ):
                return {nid: {k: out[nid][k] for k in fields} for nid, fields in batch.items()}
            print(f"  lote inválido, tentativa {attempt + 1}")
            time.sleep(3)
        except Exception as e:
            msg = str(e)
            low = msg.lower()
            if "429" in msg or "rate" in low or "queue" in low or "too_many" in low:
                transient = "queue" in low or "traffic" in low or "too_many" in low
                wait = (3 if transient else 15) * (attempt + 1)
                print(f"  ocupado, aguardando {wait}s...")
                time.sleep(wait)
            else:
                print(f"  erro: {msg[:120]}")
                time.sleep(3)
    return None


def chunked(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def update_manifest(code):
    """Garante que o idioma esteja em data/languages.json (auto-descoberta na UI)."""
    langs = load_json(MANIFEST, []) or []
    if not any(x.get("code") == code for x in langs):
        langs.append({"code": code, "name": AUTONYMS.get(code, code)})
        save_json(MANIFEST, langs)
        print(f"  manifesto atualizado: +{code}")


# ---------------------------------------------------------------- main
def main():
    if not os.getenv("CEREBRAS_API_KEY"):
        raise SystemExit("Defina CEREBRAS_API_KEY no ambiente.")
    if DST_LANG == SRC_LANG:
        raise SystemExit("Idioma origem e destino são iguais.")

    print(f"Traduzindo {SRC_NAME} -> {DST_NAME}  (modelo: {MODEL}, lote: {BATCH_SIZE})")
    print(f"  fonte: {SRC.name}  →  saída: {OUT.name}")

    tree = load_json(SRC)
    cache = load_json(CACHE, {}) or {}

    nodes = flatten(tree, [])
    todo = [n for n in nodes if n["id"] not in cache]
    print(f"Nós: {len(nodes)} | já traduzidos: {len(cache)} | faltando: {len(todo)}")

    batches = list(chunked(todo, BATCH_SIZE))
    done = 0
    last_req = 0.0
    for bi, group in enumerate(batches):
        # monta o lote só com nós que têm texto
        batch = {}
        for node in group:
            fields = extract_fields(node)
            if fields:
                batch[node["id"]] = fields
            else:
                cache[node["id"]] = {}

        if batch:
            # respeita o intervalo mínimo entre requests (~5/min)
            wait = REQUEST_INTERVAL - (time.time() - last_req)
            if wait > 0:
                time.sleep(wait)
            last_req = time.time()

            result = translate_batch(batch)
            for nid, fields in batch.items():
                cache[nid] = result[nid] if result else fields  # fallback: original

        done += len(group)
        status = "ok" if (not batch or result) else "FALHOU (manteve original)"
        print(f"[lote {bi + 1}/{len(batches)}] {done}/{len(todo)} nós — {status}")
        save_json(CACHE, cache)

    save_json(CACHE, cache)

    en_tree = copy.deepcopy(tree)
    for node in flatten(en_tree, []):
        for k, v in cache.get(node["id"], {}).items():
            node[k] = v
    save_json(OUT, en_tree)
    update_manifest(DST_LANG)
    print(f"\nPronto → {OUT}")


if __name__ == "__main__":
    main()
