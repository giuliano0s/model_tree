# model-tree-mcp

Servidor MCP que surfaca os modelos preditivos **recentes/nicho que o seu LLM
esqueceria** (TabPFN, TimeGPT, NGBoost, Causal Forest, DeepSurv, ...) para o seu
dataset. Para os modelos conhecidos (regressão, random forest, XGBoost, ARIMA) o
próprio LLM já acerta; este servidor existe para o que ele subrepresenta.

A tool consulta um endpoint hospedado que filtra a árvore de 400+ modelos a um
conjunto curado de ocultos e reordena por encaixe estatístico.

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

- **Tool `find_overlooked_models(situation, profile, top_k=6)`** — dado o perfil do
  dataset, devolve os modelos **recentes/nicho** (do conjunto curado de ocultos) que cabem
  e que o LLM tende a esquecer, cada um com seus campos, o `stat_fit`, um `fitScore` e
  `reasons` auditáveis. Use depois de já ter o seu pick padrão; respeite as caveats de cada
  candidato. Lista vazia é resposta válida ("seu pick clássico é o certo").
- **Prompt `analyze_dataset(data_path)`** — o agente investiga, faz a EDA local (profunda
  no dado cru ou rasa numa EDA prévia, com os tokens do usuário; agrega para big data), dá
  a recomendação padrão da própria memória e então checa `find_overlooked_models` para o
  que ele perdeu. Os dados crus nunca saem da máquina.

## Desenvolvimento

```bash
uv run model-tree-mcp        # roda o server localmente (stdio)
uv build                     # gera o pacote distribuível
```
