"""
Indexa a árvore de modelos no Upstash Vector (índice híbrido).

Cada nó vira 1 chunk: o texto descritivo é vetorizado pelo modelo embutido do
Upstash (denso text-embedding-3-small + esparso BM25; passa-se texto cru). Os
campos id/name/year/branch/depth/leaf viram metadados filtráveis.

Reseta o índice e reingere a base do idioma escolhido (default: en).

Uso:
    pip install -r scripts/requirements.txt
    python scripts/index_tree.py [lang]
"""

import sys
import json
from pathlib import Path
from upstash_vector import Index, Vector

# carrega .env da raiz do projeto (se python-dotenv estiver instalado)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

# ---------------------------------------------------------------- config
ROOT = Path(__file__).resolve().parent.parent
LANG = sys.argv[1] if len(sys.argv) > 1 else "en"
SRC = ROOT / "data" / f"models_tree.{LANG}.json"
BATCH_SIZE = 100

# ---------------------------------------------------------------- chunk
# reúne todos os campos descritivos do nó num único texto (vira o embedding)
def build_text(node):
    parts = [f"{node['name']} ({node.get('year', '')})".strip()]
    if node.get("diff_siblings"):
        parts.append(f"Difference: {node['diff_siblings']}")
    if node.get("strengths"):
        parts.append("Strengths: " + "; ".join(node["strengths"]))
    if node.get("weaknesses"):
        parts.append("Weaknesses: " + "; ".join(node["weaknesses"]))
    if node.get("recommended_for"):
        parts.append("Recommended for: " + "; ".join(node["recommended_for"]))
    if node.get("not_recommended_for"):
        parts.append("Not recommended for: " + "; ".join(node["not_recommended_for"]))
    if node.get("curiosity"):
        parts.append("Curiosity: " + node["curiosity"])
    return "\n".join(parts)

# ---------------------------------------------------------------- travessia
# percorre a árvore em profundidade, rastreando ramo (ml/ai/st) e nível
def flatten(node, branch="", depth=0, out=None):
    if out is None:
        out = []
    out.append({
        "id": node["id"],
        "data": build_text(node),
        "metadata": {
            "id": node["id"],
            "name": node["name"],
            "year": node.get("year"),
            "branch": branch,
            "depth": depth,
            "leaf": not node.get("children"),
        },
    })
    for child in node.get("children", []):
        child_branch = child["id"] if depth == 0 else branch
        flatten(child, child_branch, depth + 1, out)
    return out

# ---------------------------------------------------------------- main
def main():
    tree = json.loads(SRC.read_text(encoding="utf-8"))
    records = flatten(tree)
    index = Index.from_env()

    # limpa o índice antes de reingerir
    index.reset()

    # envia em lotes; cada Vector usa texto cru (embedding feito pelo Upstash)
    for i in range(0, len(records), BATCH_SIZE):
        chunk = records[i:i + BATCH_SIZE]
        index.upsert(vectors=[
            Vector(id=r["id"], data=r["data"], metadata=r["metadata"])
            for r in chunk
        ])
        print(f"indexados {min(i + BATCH_SIZE, len(records))}/{len(records)}")

    print(f"OK: {len(records)} nós indexados em {index.info().vector_count} vetores")

if __name__ == "__main__":
    main()
