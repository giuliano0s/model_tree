"""
Servidor MCP da árvore model-tree.

Expõe duas coisas ao cliente (Claude Code, etc.):

- tool `buscar_modelo`: consulta o endpoint público /api/search e devolve os modelos
  mais próximos de uma situação, cada um com seus metadados (incluindo `stat_fit`,
  o perfil de encaixe estatístico usado para casar com o dataset).
- prompt `analisar_dataset`: orquestra o fluxo de recomendação a partir de um dataset
  local. O raciocínio (investigação + EDA) roda no AGENTE, com os tokens do usuário;
  os dados crus nunca saem da máquina. O pacote em si não lê dados nem guarda segredo.

Config no cliente MCP:
    "model-tree": { "command": "uvx", "args": ["model-tree-mcp"] }

A URL pode ser ajustada pela env var MODEL_TREE_API.
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
def buscar_modelo(situacao: str, top_k: int = 8) -> list[dict]:
    """Busca na taxonomia os modelos preditivos mais próximos de uma situação.

    Passe uma descrição EM INGLÊS, enriquecida com vocabulário técnico (tarefa,
    distribuição do target, regime n/p, tipos de feature, loss/métrica desejada),
    não as palavras cruas do usuário — isso amplia o recall.

    Cada modelo retornado traz seus campos (diff_siblings, strengths, weaknesses,
    recommended_for, not_recommended_for, keywords) e o `stat_fit` (perfil de
    encaixe estatístico: tipo/distribuição de target, regime de dados, tipos de
    feature, suposições, loss suportada, contraindicações). Use o `stat_fit` e a
    loss desejada para julgar a adequação de cada candidato ao dataset.

    Args:
        situacao: descrição técnica em inglês do problema/dados/restrições.
        top_k: quantos candidatos retornar (padrão 8; escolha 3-4 finais).
    """
    resp = httpx.post(
        ENDPOINT,
        json={"situacao": situacao, "topK": top_k},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("modelos", [])


@mcp.prompt()
def analisar_dataset(caminho_dos_dados: str = "") -> str:
    """Recomenda modelos preditivos analisando um dataset local.

    Investiga o problema, faz a EDA (profunda ou rasa), busca na taxonomia e
    recomenda 3-4 modelos com trade-offs, aterrado nas estatísticas do dataset.
    """
    alvo = caminho_dos_dados or "o diretório/arquivo de dados indicado pelo usuário"
    return f"""You are a senior data-science tutor helping choose predictive models for a real dataset. The data is at: {alvo}.

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
- Call the tool `buscar_modelo` ONCE with a concise ENGLISH query enriched from the profile (task + target distribution + n/p regime + feature types + desired loss), not the user's raw words.

PHASE 4 — RECOMMEND 3-4 models with trade-offs:
- Ground every recommendation ONLY in the returned candidates and their fields, especially each candidate's `stat_fit` (target/distribution, data regime, feature types, assumptions, supported `loss`, contraindications). Do not invent models.
- Match against the profile AND the user's loss: a candidate that does not support the desired loss is a weaker fit even if otherwise suitable (e.g. quantile loss → quantile regression or gradient boosting with a quantile objective; calibrated uncertainty / CRPS → probabilistic models like NGBoost).
- Lead with the best fit for the task at the current state of the art; keep valid classics (linear/logistic regression, random forest, ARIMA) as first-class when they fit; flag when a candidate is contraindicated for this dataset (e.g. overdispersed counts → negative binomial over Poisson; tiny n → avoid heavy deep models).
- For each of the 3-4: one line on WHY it fits this profile + its key trade-off. End by offering to go deeper on any of them.
- Be honest: if the dataset is ill-posed or no candidate truly fits, say so and explain what would be needed.

LANGUAGE: reply in the language the user writes in; default to English. Keep proper names of models, libraries and metrics in their conventional (English) form."""


def main():
    mcp.run()


if __name__ == "__main__":
    main()
