"""
Pipeline de enriquecimento da taxonomia.

Recebe nomes de modelos; cada nome vira exatamente um nó folha. Cada um é gerado (conteúdo
+ keywords de busca + posição na árvore) via Gemini com pesquisa na web e inserido sob a
categoria EXISTENTE mais profunda que de fato o comporta. Insere em models_tree.en.json com
id novo e traduz cada idioma a partir do EN. Categorias novas e variantes de tarefa de um
mesmo modelo (ex.: classificação + regressão) são feitas manualmente.

A base vetorial só é reindexada se houver o token de ESCRITA do Upstash no ambiente
(mantenedor). Quem contribui sem esse token gera os dados localmente e abre um Pull
Request; o mantenedor reindexa ao aceitar.

Geração: Gemini 2.5 Pro + Google Search (precisa de billing; Flash via GEMINI_ENRICH_MODEL).
Tradução: translate_tree.py (en -> idioma, com cache; só traduz o que mudou).

Uso:
    python scripts/enrich_tree.py "N-HiTS" "ControlNet"
    python scripts/enrich_tree.py --no-reindex "Mamba"   # gera e traduz, não toca na base
    # sem args: lê nomes de scripts/new_models.txt (um por linha)

Config via env: GEMINI_ENRICH_MODEL, REQUEST_INTERVAL.
"""

import os
import re
import sys
import json
import time
import subprocess
from pathlib import Path
from google import genai
from google.genai import types

# carrega .env da raiz do projeto (se python-dotenv estiver instalado)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

# ---------------------------------------------------------------- config
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SOURCE_LANG = "en"
SRC = DATA / f"models_tree.{SOURCE_LANG}.json"
NAMES_FILE = ROOT / "scripts" / "new_models.txt"

GEN_MODEL = os.getenv("GEMINI_ENRICH_MODEL", "gemini-2.5-pro")
REQUEST_INTERVAL = float(os.getenv("REQUEST_INTERVAL", "12.5"))

gemini = genai.Client(api_key=os.getenv("GEMINI_ENRICH_API_KEY") or os.getenv("GEMINI_API_KEY"))

# ---------------------------------------------------------------- helpers de árvore
# percorre a árvore em profundidade
def flatten(node, acc):
    acc.append(node)
    for c in node.get("children", []):
        flatten(c, acc)
    return acc

# lista (id, breadcrumb) dos pontos válidos de inserção: nós-categoria (id slug) ou
# qualquer nó com filhos. Inclui categorias recém-criadas ainda sem filhos (ex.: um
# "Stable Diffusion" novo), que de outra forma ficariam invisíveis para a LLM.
def collect_parents(node, path, out):
    here = path + [node["name"]]
    if node.get("children") or not re.match(r"^l\d+$", node["id"]):
        out.append((node["id"], " > ".join(here)))
    for c in node.get("children", []):
        collect_parents(c, here, out)
    return out

# acha um nó pelo id
def find_node(node, target):
    if node["id"] == target:
        return node
    for c in node.get("children", []):
        hit = find_node(c, target)
        if hit:
            return hit
    return None

# normaliza nome para detectar duplicatas: minúsculas, sem traços/espaços/pontuação
def norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())

# conjunto de nomes já presentes (nome cheio + parte antes do parêntese)
def existing_names(root):
    out = set()
    for n in flatten(root, []):
        out.add(norm(n["name"]))
        out.add(norm(n["name"].split("(")[0]))
    return out

# próximo id de folha livre (l001, l002, ...)
def next_leaf_id(all_nodes):
    nums = [int(m.group(1)) for n in all_nodes if (m := re.match(r"^l(\d+)$", n["id"]))]
    nxt = (max(nums) + 1) if nums else 1
    return f"l{nxt:03d}"

def find_node_id_in(parents, pid):
    return any(p[0] == pid for p in parents)

# extrai o JSON da resposta, mesmo com cercas ou texto de citação ao redor
def parse_json_loose(s):
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?", "", s).strip()
        s = re.sub(r"```$", "", s).strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", s, re.DOTALL)
        if not m:
            raise
        return json.loads(m.group(0))

# ---------------------------------------------------------------- geração (Gemini + web)
GEN_SYSTEM = (
    "You are an expert taxonomist of predictive models (machine learning, deep learning, "
    "classical statistics). Research the given MODEL NAME on the web and return a single JSON "
    "object describing it and where it fits among the taxonomy CATEGORIES.\n"
    "Rules:\n"
    "1. Placement is a search for the deepest EXISTING node that genuinely fits. Start from the "
    "most specific category and ask 'does this model belong as a child here?'; if not, climb to "
    "the parent and ask again, stopping at the first node where it truly fits — never settle on a "
    "broad ancestor when a precise descendant exists. Classify by architecture and lineage "
    "(read the breadcrumb paths): a variant, fine-tune or extension of a more specific model in "
    "the list attaches to THAT model, not its broad family (e.g. a Stable-Diffusion-based editor "
    "goes under 'Stable Diffusion', a non-Stable-Diffusion diffusion model under 'Diffusion "
    "Models'). You must choose a 'parent_id' from the list as given; do NOT invent new categories. "
    "If no group is a perfect fit, pick the closest existing one.\n"
    "2. Create exactly ONE node for this MODEL NAME, as given. Do not split it into per-task "
    "variants or invent sibling nodes; if a model needs separate task variants, they are added "
    "separately by name.\n"
    "3. Write all text in English, concise and technical, like a curated catalog.\n"
    "4. Keep the model's own proper name and any algorithm/library names unchanged.\n"
    "5. Fields: name (display name), year (integer of first publication, verified), diff_siblings "
    "(1 sentence on how it differs from siblings under the chosen parent), strengths (3 short "
    "items), weaknesses (3 short items), recommended_for (2 short items), not_recommended_for "
    "(2 short items), curiosity (1 verifiable sentence, with author/year), keywords (8-15 "
    "lowercase English search terms, NOT shown to users, used by a vector + keyword index so "
    "task-phrased queries find this model: the tasks it performs, its technique/family, the data "
    "type, and common query phrasings/synonyms), stat_fit (SPARSE statistical-fit object, NOT "
    "shown to users, used to match a dataset to this model — include ONLY the keys relevant to "
    "choosing it, omit the rest: target {types, distributions, notes}, data_regime {rows, "
    "dimensionality, needs}, features {types, interpretability, notes}, assumptions [], loss "
    "[objectives/loss it optimizes or supports], contraindicated_when []).\n"
    "6. 'parent_id' must be an id from the list.\n"
    '7. Return ONLY the JSON object: {"parent_id": "...", "name": "...", '
    '"year": 0, "diff_siblings": "...", "strengths": [], "weaknesses": [], "recommended_for": [], '
    '"not_recommended_for": [], "curiosity": "...", "keywords": [], "stat_fit": {}}. '
    "No markdown fences, no extra text."
)

# gera o nó de um modelo (pesquisa na web) e decide o parent
def generate_node(name, parents):
    block = "\n".join(f"{pid} :: {path}" for pid, path in parents)
    prompt = f"{GEN_SYSTEM}\n\nMODEL NAME: {name}\n\nCATEGORIES:\n{block}"
    for attempt in range(3):
        try:
            resp = gemini.models.generate_content(
                model=GEN_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    temperature=0.2,
                ),
            )
            data = parse_json_loose(resp.text)
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(20 * (attempt + 1))
    if not find_node_id_in(parents, data.get("parent_id")):
        raise ValueError(f"parent_id inválido para '{name}': {data.get('parent_id')}")
    return data

# ---------------------------------------------------------------- montagem
def build_node(node_id, gen):
    return {
        "id": node_id,
        "name": gen["name"],
        "year": gen.get("year"),
        "diff_siblings": gen.get("diff_siblings", ""),
        "strengths": gen.get("strengths", []),
        "weaknesses": gen.get("weaknesses", []),
        "recommended_for": gen.get("recommended_for", []),
        "not_recommended_for": gen.get("not_recommended_for", []),
        "curiosity": gen.get("curiosity", ""),
        "keywords": gen.get("keywords", []),
        "stat_fit": gen.get("stat_fit", {}),
        "children": [],
    }

def load(path):
    return json.loads(path.read_text(encoding="utf-8"))

def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

# idiomas com arquivo de dados, exceto a fonte
def discover_languages():
    langs = []
    for f in sorted(DATA.glob("models_tree.*.json")):
        code = f.stem.split(".")[-1]
        if code not in (SOURCE_LANG, "backup"):
            langs.append(code)
    return langs

# ---------------------------------------------------------------- main
def main():
    args = sys.argv[1:]
    # --no-reindex força o fluxo do contribuidor: gera e traduz, mas não toca na base
    no_reindex = "--no-reindex" in args
    names = [a for a in args if not a.startswith("--")]
    if not names and NAMES_FILE.exists():
        names = [l.strip() for l in NAMES_FILE.read_text(encoding="utf-8").splitlines() if l.strip()]
    if not names:
        print("nenhum nome informado (args ou scripts/new_models.txt)")
        return

    # chave de geração é obrigatória (Gemini, ou Cerebras se for o provedor da tradução)
    if not (os.getenv("GEMINI_ENRICH_API_KEY") or os.getenv("GEMINI_API_KEY")):
        print("ERRO: defina GEMINI_ENRICH_API_KEY (ou GEMINI_API_KEY) no .env para gerar os nós.")
        print("Veja .env.example. É a única chave necessária para contribuir.")
        return

    # token de escrita do Upstash é opcional: sem ele, roda em modo contribuidor
    write_token = (os.getenv("UPSTASH_VECTOR_REST_TOKEN") or "").strip()
    has_write_token = bool(write_token) and "..." not in write_token and not no_reindex
    if not has_write_token:
        print("Modo contribuidor: vou gerar e traduzir localmente, mas NÃO reindexar a base")
        print("(sem token de escrita do Upstash). Ao terminar, faça commit em data/ e abra um PR.\n")

    en_tree = load(SRC)
    parents = collect_parents(en_tree, [], [])
    existing = existing_names(en_tree)

    # cada nome de entrada vira exatamente um nó. Variantes de tarefa de um mesmo
    # modelo (ex.: classificação + regressão) são decididas manualmente, passando
    # os nomes já separados.
    targets = names

    # gera cada modelo em inglês e insere sob uma categoria existente
    novos = []  # (parent_id, en_node)
    for name in targets:
        if norm(name) in existing:
            print(f"[skip] '{name}' já existe")
            continue
        gen = generate_node(name, parents)
        # o nome oficial gerado pode diferir do que o usuário digitou
        gen_keys = {norm(gen["name"]), norm(gen["name"].split("(")[0])}
        if gen_keys & existing:
            print(f"[skip] '{name}' -> '{gen['name']}' já existe")
            continue

        # encaixa sob uma categoria existente (categorias novas são criadas manualmente)
        parent_id = gen["parent_id"]
        node_id = next_leaf_id(flatten(en_tree, []))
        en_node = build_node(node_id, gen)
        find_node(en_tree, parent_id)["children"].append(en_node)
        novos.append((parent_id, en_node))
        existing |= gen_keys  # evita duplicar nomes na mesma execução
        print(f"[en] {name} -> {node_id} sob {parent_id}")
        time.sleep(REQUEST_INTERVAL)

    if not novos:
        print("nada novo a adicionar")
        return

    save(SRC, en_tree)

    # traduz cada idioma a partir do EN (translate_tree reconstrói o arquivo; o cache só
    # traduz o que mudou). Processo isolado para não herdar sys.argv.
    for lang in discover_languages():
        print(f"traduzindo en -> {lang}...")
        subprocess.run([sys.executable, str(ROOT / "scripts" / "translate_tree.py"), lang], check=True)

    # reindexa só no modo mantenedor (token de escrita presente e sem --no-reindex);
    # has_write_token foi decidido no início. Contribuidor abre PR; mantenedor reindexa.
    if has_write_token:
        print("reindexando...")
        subprocess.run([sys.executable, str(ROOT / "scripts" / "index_tree.py")], check=True)
        print(f"OK: {len(novos)} modelos adicionados, traduzidos e indexados")
    else:
        print(f"\nOK: {len(novos)} modelo(s) adicionado(s) e traduzido(s) localmente.")
        print("A base vetorial NÃO foi reindexada. Faça commit das mudanças em data/ e abra")
        print("um Pull Request; o mantenedor reindexa a base ao aceitar.")

if __name__ == "__main__":
    main()
