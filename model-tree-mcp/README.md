# model-tree-mcp

Servidor MCP que recomenda modelos preditivos (ML, Deep Learning, Estatística
Clássica) a partir da descrição de uma situação em linguagem natural.

A tool consulta um endpoint hospedado que faz a busca vetorial na árvore de
400+ modelos curados.

## Uso (Claude Code / Claude Desktop)

Adicione ao seu config de MCP:

```json
{
  "mcpServers": {
    "model-tree": {
      "command": "uvx",
      "args": ["model-tree-mcp"]
    }
  }
}
```

O `uvx` baixa e roda o pacote num ambiente isolado, sem instalação manual.

### Apontar para outro endpoint

Por padrão a tool chama o endpoint público oficial. Para usar outro (ex.: um
deploy próprio), defina a env var `MODEL_TREE_API`:

```json
"env": { "MODEL_TREE_API": "https://seu-deploy.vercel.app/api/search" }
```

## Tool e prompt

- **Tool `search_models(situation: str, top_k: int = 8)`** — devolve os modelos mais
  próximos da situação descrita, cada um com seus campos (diff_siblings, strengths,
  weaknesses, recommended_for, not_recommended_for, keywords) e o `stat_fit` (perfil de
  encaixe estatístico: tipo/distribuição do target, regime n/p, tipos de feature,
  suposições, loss suportada, contraindicações).
- **Prompt `analyze_dataset(data_path)`** — orquestra a recomendação a partir de um
  dataset local: o agente investiga (target, loss), faz a EDA (profunda no dado cru ou
  rasa numa EDA prévia, com os tokens do usuário) e recomenda 3-4 modelos com tradeoffs.
  Os dados crus nunca saem da máquina.

## Desenvolvimento

```bash
uv run model-tree-mcp        # roda o server localmente (stdio)
uv build                     # gera o pacote distribuível
```
