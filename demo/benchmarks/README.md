# Benchmark: os LLMs esquecem do modelo oculto?

A ferramenta `model-tree` foi reposicionada para fazer **uma** coisa: dado o perfil de um dataset,
surfacar os modelos **recentes/nicho** que cabem e que o próprio LLM do usuário esqueceria
(TabPFN, TimeGPT, Chronos, NGBoost, Causal Forest, DeepSurv, ...). Este benchmark testa se esse
valor é real e **onde** ele existe ou não.

## Método

Cada caso é um cenário. Seis concorrentes **crus** respondem da própria memória (sem ferramenta):

- **básico:** gemini-2.5-flash, gpt-5-mini, Claude Sonnet
- **fronteira:** gemini-2.5-pro, gpt-5, Claude Opus

A **ferramenta** = busca no índice (só leitura) filtrada ao conjunto curado de ocultos
([data/hidden_models.json](../../data/hidden_models.json)) + re-ranker determinístico por `stat_fit`
([rerank.py](rerank.py), espelho de produção em [lib/rerank.ts](../../lib/rerank.ts)). gemini/openai
por API; Sonnet/Opus por subagente do Claude Code (sem chave Anthropic). Um notebook por caso
(`case_*.ipynb`) com as respostas completas + análise imparcial.

A pergunta medida: **o concorrente cru lembra do modelo oculto ideal, ou esquece?**

## Resultados (7 casos)

| Caso | Tipo | Crus nomearam o oculto? | Ferramenta |
|---|---|---|---|
| classificação tabular pequena | **ganho** | NÃO (0/6: kNN/RF/LDA) | **TabPFN** |
| forecast de séries curtas, sem treino | **parcial** | quase não (gemini/openai deram Naive; só Sonnet) | **TimeGPT/Chronos** |
| regressão com distribuição (CRPS) | empate | SIM (5/6 NGBoost) | NGBoost |
| efeito causal heterogêneo | empate | SIM (6/6 Causal Forest) | Causal Forest |
| sobrevivência não-linear | empate | deram RSF/GB-survival, não DeepSurv | DeepSurv |
| contagem com zeros/superdispersão | limite | clássico (NB/ZINB) | nenhum oculto cabe |
| classificação em big data | limite | clássico (boosters) | nenhum oculto cabe |

## Veredito honesto

- **O valor é real mas estreito.** A ferramenta surfaca o oculto de forma decisiva só quando ele é
  **genuinamente obscuro** (TabPFN: 0/6 o citaram), e parcialmente quando o cenário pede um
  foundation model que os modelos menores ainda perdem (forecast: gemini/openai deram o baseline
  trivial Naive).
- **A maioria dos "ocultos" não é oculta.** NGBoost, Causal Forest e os modelos de sobrevivência ML
  os LLMs já conhecem quando o cenário aponta para eles. Ali a ferramenta **empata** e não agrega.
- **Nos casos clássicos** (contagem, big data) nenhum oculto cabe, e a ferramenta **diz isso** em vez
  de forçar uma recomendação.
- **O nível do modelo não muda nada.** Básico e fronteira se comportam igual: ambos esquecem o
  TabPFN, ambos conhecem o NGBoost/Causal Forest. O divisor é a obscuridade do modelo, não o tier.
- **Net:** a ferramenta ganha seu lugar na fatia dos modelos recentes **mais obscuros**
  (classe-TabPFN). O valor durável é **ficar à frente do corte de treino do LLM**, curando modelos
  novos desse tipo em [data/hidden_models.json](../../data/hidden_models.json).

## Arquitetura e status

- Ferramenta = `searchOverlookedModels` em [lib/vectorSearch.ts](../../lib/vectorSearch.ts) (busca só
  leitura -> filtra ao conjunto de ocultos -> re-ranker). Tool do MCP =
  `find_overlooked_models`. O re-ranker é determinístico (zero LLM) e devolve `fitScore` + `reasons`
  auditáveis.
- **Não há deploy nem reindexação:** a lógica roda contra o índice de produção atual (só leitura). O
  deploy na Vercel e a republicação no PyPI ficam para o mantenedor.
- O benchmark reproduz a lógica da ferramenta localmente (Python) contra o endpoint público.

## Rodar

```powershell
# usa o cache; só chama API para casos novos
.\.venv\Scripts\python demo\benchmarks\build_notebooks.py
# --fresh força nova coleta (gasta API)
```

Custo das linhas de base pagas: **~$0,26** em 28 chamadas (gemini/openai x 2 níveis x 7 casos; os
Sonnet/Opus vieram de subagentes, sem custo de chave).

## Nota de fragilidade (medida)

Um caso anterior (forecast de SKUs novos via atributos) virou um achado: com um `profile` descuidado
(flag `zero_training` onde o certo era "sem treino por série") a ferramenta promoveu o TimeGPT
erradamente, acima do modelo global que era a resposta certa. O re-ranker ordena bem **dado um
profile fiel**, mas o profile depende do raciocínio do agente. Flags devem ser **propriedades
objetivas** do problema, não interpretações. Isso está documentado no prompt do MCP (PHASE 4).
