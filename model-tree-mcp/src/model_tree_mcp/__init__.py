"""
Servidor MCP que recomenda modelos preditivos da árvore model-tree.

A tool `buscar_modelo` consulta o endpoint /api/search e devolve os modelos
mais próximos da situação descrita.

Config no cliente MCP (ex. Claude Code):
    "model-tree": { "command": "uvx", "args": ["model-tree-mcp"] }

A URL pode ser ajustada pela env var MODEL_TREE_API.
"""

import os
import httpx
from mcp.server.fastmcp import FastMCP

ENDPOINT = os.environ.get(
    "MODEL_TREE_API",
    "https://SEU-SITE.vercel.app/api/search",
)

mcp = FastMCP("model-tree")

@mcp.tool()
def buscar_modelo(situacao: str, top_k: int = 5) -> list[dict]:
    """Recomenda os modelos preditivos mais adequados a uma situação.

    Use quando o usuário descrever um problema de dados e quiser saber que tipo
    de modelo aplicar (ex.: "dados tabulares com componente de série temporal").

    Args:
        situacao: descrição em linguagem natural do problema, dados e restrições.
        top_k: quantos modelos retornar (padrão 5).
    """
    resp = httpx.post(
        ENDPOINT,
        json={"situacao": situacao, "topK": top_k},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("modelos", [])


def main():
    mcp.run()


if __name__ == "__main__":
    main()
