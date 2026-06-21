"""
Pipeline de enriquecimento da taxonomia.

Recebe nomes de modelos e, para cada um, primeiro decide se é um modelo multi-tarefa:
um nome como "XGBoost" é expandido em variantes por tarefa ("XGBoost Classification",
"XGBoost Regression"); um nome single-task segue sozinho. Cada variante então é gerada
(conteúdo + keywords de busca + posição na árvore) via Gemini com pesquisa na web e
inserida no nó mais profundo que de fato a comporta, criando uma categoria intermediária
quando o grupo de irmãos ideal ainda não existe mas há um simétrico num ramo paralelo.
Insere em models_tree.en.json com id novo e traduz cada idioma a partir do EN.

A base vetorial só é reindexada se houver o token de ESCRITA do Upstash no ambiente
(mantenedor). Quem contribui sem esse token gera os dados localmente e abre um Pull
Request; o mantenedor reindexa ao aceitar.

Geração: Gemini 2.5 Pro + Google Search (precisa de billing; Flash via GEMINI_ENRICH_MODEL).
Tradução: translate_tree.py (en -> idioma, com cache; só traduz o que mudou).

Uso:
    python scripts/enrich_tree.py "XGBoost" "N-HiTS" "ControlNet"
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

# id de categoria a partir do id do pai e do nome (slug), garantindo unicidade
def category_id(parent_id, name, taken):
    base = parent_id.split("-")[0]
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:18]
    cand = f"{base}-{slug}"
    i = 2
    while cand in taken:
        cand = f"{base}-{slug}-{i}"
        i += 1
    return cand

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
    "1. Placement is a search for the deepest node that genuinely fits. Start from the most "
    "specific category and ask 'does this model belong as a child here?'; if not, climb to the "
    "parent and ask again, stopping at the first node where it truly fits — never settle on a "
    "broad ancestor when a precise descendant exists. Classify by architecture and lineage "
    "(read the breadcrumb paths): a variant, fine-tune or extension of a more specific model in "
    "the list attaches to THAT model, not its broad family (e.g. a Stable-Diffusion-based editor "
    "goes under 'Stable Diffusion', a non-Stable-Diffusion diffusion model under 'Diffusion "
    "Models'). When the ideal sibling group does not exist yet but a symmetric one does in a "
    "parallel branch (e.g. a regression ensemble when only the classification ensemble group "
    "exists), set 'new_parent' to create the missing intermediate category under the correct "
    "ancestor rather than dumping the node in a generic catch-all.\n"
    "2. This MODEL NAME has already been scoped to a single task/variant; place exactly this one "
    "node. Do not invent extra task variants here — that decision was made upstream.\n"
    "3. Write all text in English, concise and technical, like a curated catalog.\n"
    "4. Keep the model's own proper name and any algorithm/library names unchanged.\n"
    "5. Fields: name (display name), year (integer of first publication, verified), diff_siblings "
    "(1 sentence on how it differs from siblings under the chosen parent), strengths (3 short "
    "items), weaknesses (3 short items), recommended_for (2 short items), not_recommended_for "
    "(2 short items), curiosity (1 verifiable sentence, with author/year), keywords (8-15 "
    "lowercase English search terms, NOT shown to users, used by a vector + keyword index so "
    "task-phrased queries find this model: the tasks it performs, its technique/family, the data "
    "type, and common query phrasings/synonyms).\n"
    "6. 'parent_id' must be an id from the list. To request a new intermediate category, also set "
    "'new_parent' to {\"under\": \"<existing parent_id>\", \"name\": \"<category name>\"}; otherwise "
    "set 'new_parent' to null.\n"
    '7. Return ONLY the JSON object: {"parent_id": "...", "new_parent": null, "name": "...", '
    '"year": 0, "diff_siblings": "...", "strengths": [], "weaknesses": [], "recommended_for": [], '
    '"not_recommended_for": [], "curiosity": "...", "keywords": []}. No markdown fences, no extra text.'
)

# decide se um nome cru representa um único modelo ou um modelo multi-tarefa que merece
# variantes (ex.: "XGBoost" -> classificação + regressão). Devolve a lista de nomes a inserir.
EXPAND_SYSTEM = (
    "You are an expert taxonomist of predictive models. Given a raw MODEL NAME, decide whether it "
    "denotes one single-purpose model or a general method commonly applied to several distinct "
    "supervised tasks (regression, classification, ranking, survival, etc.).\n"
    "If it is genuinely used across multiple tasks in practice, return one display name per task, "
    "each naming the task explicitly (e.g. 'XGBoost' -> ['XGBoost Classification', 'XGBoost "
    "Regression']). Only split on tasks where the model is actually used in the real world; do not "
    "manufacture variants for tasks nobody uses it for.\n"
    "If it is intrinsically single-task (e.g. 'DBSCAN', 'Kaplan-Meier', 'Logistic Regression'), "
    "return the name unchanged as the sole element.\n"
    'Return ONLY a JSON array of strings. No markdown fences, no extra text. E.g. ["XGBoost '
    'Classification", "XGBoost Regression"].'
)

# expande um nome cru nas suas variantes por tarefa (single-task devolve o próprio nome)
def expand_variants(name):
    prompt = f"{EXPAND_SYSTEM}\n\nMODEL NAME: {name}"
    for attempt in range(3):
        try:
            resp = gemini.models.generate_content(
                model=GEN_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(temperature=0.0),
            )
            data = parse_json_loose(resp.text)
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(20 * (attempt + 1))
    if isinstance(data, dict):
        data = data.get("variants") or data.get("names") or list(data.values())
    variants = [str(v).strip() for v in data if str(v).strip()]
    return variants or [name]

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
    np = data.get("new_parent")
    if np and not find_node_id_in(parents, np.get("under")):
        raise ValueError(f"new_parent.under inválido para '{name}': {np.get('under')}")
    if not np and not find_node_id_in(parents, data.get("parent_id")):
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
    names = sys.argv[1:]
    if not names and NAMES_FILE.exists():
        names = [l.strip() for l in NAMES_FILE.read_text(encoding="utf-8").splitlines() if l.strip()]
    if not names:
        print("nenhum nome informado (args ou scripts/new_models.txt)")
        return

    en_tree = load(SRC)
    parents = collect_parents(en_tree, [], [])
    existing = existing_names(en_tree)
    taken_ids = {n["id"] for n in flatten(en_tree, [])}

    # expande cada nome cru nas variantes por tarefa (multi-task vira vários nós)
    targets = []
    for name in names:
        variants = expand_variants(name)
        if variants != [name]:
            print(f"[expand] '{name}' -> {', '.join(variants)}")
        targets.extend(variants)
        time.sleep(REQUEST_INTERVAL)

    # gera cada variante em inglês e insere no parent escolhido (criando categoria se pedido)
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

        # cria a categoria intermediária pedida, se ainda não existir
        np = gen.get("new_parent")
        if np:
            under = np["under"]
            cat_match = next((p for p in parents if p[1].split(" > ")[-1] == np["name"]), None)
            if cat_match:
                parent_id = cat_match[0]
            else:
                parent_id = category_id(under, np["name"], taken_ids)
                taken_ids.add(parent_id)
                cat_node = {
                    "id": parent_id, "name": np["name"], "year": None,
                    "diff_siblings": "", "strengths": [], "weaknesses": [],
                    "recommended_for": [], "not_recommended_for": [], "curiosity": "",
                    "children": [],
                }
                find_node(en_tree, under)["children"].append(cat_node)
                parents = collect_parents(en_tree, [], [])  # categoria nova vira destino válido
                print(f"[cat] '{np['name']}' -> {parent_id} sob {under}")
        else:
            parent_id = gen["parent_id"]

        node_id = next_leaf_id(flatten(en_tree, []))
        en_node = build_node(node_id, gen)
        find_node(en_tree, parent_id)["children"].append(en_node)
        taken_ids.add(node_id)
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

    # reindexa a base SÓ se houver o token de escrita do Upstash (mantenedor). Contribuidor
    # sem o token para aqui e abre PR; o reingest é feito pelo mantenedor ao aceitar.
    if os.getenv("UPSTASH_VECTOR_REST_TOKEN"):
        print("reindexando...")
        subprocess.run([sys.executable, str(ROOT / "scripts" / "index_tree.py")], check=True)
        print(f"OK: {len(novos)} modelos adicionados, traduzidos e indexados")
    else:
        print(f"\nOK: {len(novos)} modelo(s) adicionado(s) e traduzido(s) localmente.")
        print("Sem UPSTASH_VECTOR_REST_TOKEN (escrita) — a base vetorial NÃO foi reindexada.")
        print("Para contribuir: faça commit das mudanças em data/ e abra um Pull Request.")
        print("O mantenedor reindexa a base ao aceitar.")

if __name__ == "__main__":
    main()
