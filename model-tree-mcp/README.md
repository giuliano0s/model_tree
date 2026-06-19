# model-tree-mcp

Servidor MCP que recomenda modelos preditivos (ML, Deep Learning, Estatística
Clássica) a partir da descrição de uma situação em linguagem natural.

A tool consulta um endpoint hospedado que faz a busca vetorial na árvore de
365 modelos curados.

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

## Tool

- `buscar_modelo(situacao: str, top_k: int = 5)` — devolve os modelos mais
  próximos da situação descrita, com `id`, `name`, `year`, `branch` e `score`.

## Desenvolvimento

```bash
uv run model-tree-mcp        # roda o server localmente (stdio)
uv build                     # gera o pacote distribuível
```
