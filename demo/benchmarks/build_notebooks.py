"""
Monta um notebook por caso do benchmark de "modelos ocultos".

gemini/openai (2 níveis) são chamados ao vivo e cacheados em results.json (coleta incremental:
só busca casos ausentes do cache). Sonnet/Opus vêm de subagentes do Claude Code (sem chave
Anthropic), embutidos em CLAUDE_ANSWERS. A ferramenta (só ocultos) é recomputada a cada build
(grátis) via bench_lib.tool_overlooked.

Uso:
    python demo/benchmarks/build_notebooks.py          # usa cache; só chama API para casos novos
    python demo/benchmarks/build_notebooks.py --fresh  # força nova coleta (gasta API)
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import bench_lib as B

RESULTS_JSON = HERE / "results.json"

# respostas cruas do Claude (subagentes; Sonnet = básico, Opus = fronteira)
CLAUDE_ANSWERS = {
    "classification": {
        "basic": {"model": "claude-sonnet-4-6", "text": (
            "MODEL: Linear Discriminant Analysis (LDA)\n\nWith 400 rows, 15 numeric features and 3 "
            "balanced classes, LDA fits analytically in one pass (no training time, no hyperparameters) "
            "and is a strong, overfit-resistant bet on small clean tabular data. Trade-off: if the true "
            "boundary is nonlinear, a tuned ensemble would beat it.")},
        "frontier": {"model": "claude-opus-4-8", "text": (
            "MODEL: Random Forest\n\nStrongest default here: excellent out-of-the-box accuracy on a "
            "small clean tabular set with essentially no tuning, robust to scaling, instant to train at "
            "this size. Trade-off: black-box vs a transparent model, and a tuned booster might edge it "
            "out, but not without the tuning you want to avoid.")},
    },
    "forecast_zeroshot": {
        "basic": {"model": "claude-sonnet-4-6", "text": (
            "MODEL: N-BEATS / N-HiTS (zero-shot pretrained variant)\n\nPretrained N-BEATS/N-HiTS or "
            "foundation forecasters (Nixtla TimeGPT, Amazon Chronos) do zero-shot inference with no "
            "per-series fitting, exactly what the constraint requires. At 30-60 points per series, any "
            "per-series fit (ARIMA, ETS, Prophet) has high variance and cost multiplied by thousands of "
            "series. Trade-off: you give up per-series fine-tuning for instant, linearly scalable "
            "inference.")},
        "frontier": {"model": "claude-opus-4-8", "text": (
            "MODEL: Croston's method (SBA variant)\n\nFor thousands of short, likely intermittent series "
            "needing instant forecasts with zero fitting, Croston's runs per-series with fixed default "
            "smoothing (no training step) and is robust at 30-60 points. Trade-off: a simple level "
            "forecaster with no seasonality/covariates. (A pretrained foundation forecaster such as "
            "TimesFM or Chronos gives true zero-shot inference as an alternative.)")},
    },
    "prob_regression": {
        "basic": {"model": "claude-sonnet-4-6", "text": (
            "MODEL: NGBoost (Natural Gradient Boosting)\n\nNGBoost fits distributional parameters as the "
            "target, minimizing proper scoring rules (CRPS / log-likelihood) directly, and outputs a "
            "full predictive distribution per row over mixed tabular features. Trade-off: slower than "
            "standard GBMs and you must pick a distribution family upfront, so misspecification can hurt "
            "calibration.")},
        "frontier": {"model": "claude-opus-4-8", "text": (
            "MODEL: NGBoost (Natural Gradient Boosting)\n\nPurpose-built for this: boosts trees to output "
            "the parameters of a full predictive distribution per row and directly minimizes NLL/CRPS, "
            "giving calibrated uncertainty rather than a point estimate. Trade-off: assumes a chosen "
            "distribution family and is somewhat less sharp on point accuracy than LightGBM/XGBoost.")},
    },
    "causal": {
        "basic": {"model": "claude-sonnet-4-6", "text": (
            "MODEL: Causal Forest (Generalized Random Forest)\n\nCausal Forest (grf) targets "
            "heterogeneous treatment effects via honest splitting, yielding pointwise CATE estimates, and "
            "handles many confounders through residual-on-residual (Robinson) nuisance estimation, "
            "doubly robust in practice. Trade-off: flexible nonparametric HTE at the cost of the clean "
            "structural interpretation of a parametric model.")},
        "frontier": {"model": "claude-opus-4-8", "text": (
            "MODEL: Causal Forest (Generalized Random Forest)\n\nDirectly targets the CATE so it "
            "estimates how the effect varies across subgroups while handling many confounders "
            "nonparametrically; paired with an AIPW/doubly-robust (double machine learning) score it is "
            "orthogonal to nuisance misspecification. Trade-off: validity rests on unconfoundedness + "
            "overlap, and subgroup estimates are noisy without large samples.")},
    },
    "survival": {
        "basic": {"model": "claude-sonnet-4-6", "text": (
            "MODEL: Random Survival Forest\n\nHandles right-censoring natively via the log-rank split, "
            "captures nonlinear effects and interactions without manual specification, and yields "
            "individualized survival curves / risk at any horizon. Trade-off: you lose the hazard ratios "
            "and proportional-hazards structure of Cox, hurting clinical communication.")},
        "frontier": {"model": "claude-opus-4-8", "text": (
            "MODEL: Random Survival Forest\n\nNatively handles right-censored data while capturing "
            "nonlinear effects and high-order interactions, giving per-subject cumulative-hazard / "
            "survival curves. Trade-off: you lose clean hazard ratios (lean on variable importance) and "
            "it cannot extrapolate beyond the training range. Gradient-Boosted Survival Trees or DeepSurv "
            "are reasonable alternatives, but RSF is the most robust default here.")},
    },
    "counts": {
        "basic": {"model": "claude-sonnet-4-6", "text": (
            "MODEL: Zero-Inflated Negative Binomial Regression\n\nModels the two processes (structural "
            "zeros via a logistic part, overdispersed counts via a Negative Binomial part) explicitly, "
            "data-efficient and interpretable on small tabular data. Trade-off: two linked sub-models "
            "raise convergence risk and demand careful categorical encoding.")},
        "frontier": {"model": "claude-opus-4-8", "text": (
            "MODEL: Negative Binomial regression (NB2, log link)\n\nDirectly models non-negative integer "
            "counts with a dispersion parameter for variance far above the mean, data-efficient and "
            "interpretable via rate ratios. Trade-off: if zeros are truly inflated by a separate "
            "mechanism, a zero-inflated (ZINB) or hurdle model fits better at the cost of complexity.")},
    },
    "big_data_tabular": {
        "basic": {"model": "claude-sonnet-4-6", "text": (
            "MODEL: XGBoost\n\nHandles mixed numeric and high-cardinality categoricals and its "
            "histogram-based tree building scales to 5 million rows with controlled memory; optimizes "
            "log-loss directly for top tabular accuracy. Trade-off: hyperparameter tuning is non-trivial "
            "and training grows with tree count, though parallelism helps.")},
        "frontier": {"model": "claude-opus-4-8", "text": (
            "MODEL: LightGBM\n\nBuilt for this regime: 5M rows train fast via histogram split finding, "
            "native high-cardinality categorical handling, and GBDTs are state-of-the-art on tabular for "
            "binary churn. Trade-off: leaf-wise growth needs careful regularization/early stopping and "
            "offers less out-of-the-box interpretability (lean on SHAP).")},
    },
}

ANALYSES = {
    "classification": (
        "| Concorrente | Nível | Nomeou |\n|---|---|---|\n"
        "| gemini-2.5-flash | básico | k-NN |\n| gpt-5-mini | básico | Random Forest |\n"
        "| Claude Sonnet | básico | LDA |\n| gemini-2.5-pro | fronteira | LDA |\n"
        "| gpt-5 | fronteira | LDA |\n| Claude Opus | fronteira | Random Forest |\n"
        "| **Ferramenta** | — | **TabPFN** |\n\n"
        "**Ganho limpo, e o caso mais claro do conjunto.** Os 6 crus (básico e fronteira) deram "
        "clássicos válidos e **nenhum** citou o TabPFN, que é o modelo desenhado exatamente para a "
        "restrição (tabular pequeno, sem treino, sem tuning). Só a ferramenta o trouxe. Aqui o modelo "
        "oculto é genuinamente esquecido por todos os níveis, e a ferramenta agrega."
    ),
    "forecast_zeroshot": (
        "| Concorrente | Nível | Nomeou |\n|---|---|---|\n"
        "| gemini-2.5-flash | básico | Naive (last value) |\n| gpt-5-mini | básico | Seasonal Naive |\n"
        "| Claude Sonnet | básico | N-BEATS/N-HiTS zero-shot (+ TimeGPT/Chronos) |\n"
        "| gemini-2.5-pro | fronteira | Naive (persistence) |\n| gpt-5 | fronteira | Seasonal Naive |\n"
        "| Claude Opus | fronteira | Croston (+ foundation como aparte) |\n"
        "| **Ferramenta** | — | **TimeGPT**, **Chronos** |\n\n"
        "**Ganho parcial.** O gatilho 'sem treino algum' levou gemini e openai (4/6) ao baseline "
        "trivial (Naive / Seasonal Naive) - eles **não** surfaçaram o foundation model. Só o Claude "
        "Sonnet liderou com a família zero-shot; o Opus citou de aparte. A ferramenta traz TimeGPT/"
        "Chronos, a resposta zero-shot mais forte que a maioria perdeu. É parcial porque um cru "
        "(Sonnet) chegou lá; mas mostra que o oculto continua escapando da maioria mesmo quando o "
        "cenário o favorece."
    ),
    "prob_regression": (
        "| Concorrente | Nível | Nomeou |\n|---|---|---|\n"
        "| gemini-2.5-flash | básico | BART |\n| gpt-5-mini | básico | NGBoost |\n"
        "| Claude Sonnet | básico | NGBoost |\n| gemini-2.5-pro | fronteira | NGBoost |\n"
        "| gpt-5 | fronteira | NGBoost |\n| Claude Opus | fronteira | NGBoost |\n"
        "| **Ferramenta** | — | NGBoost |\n\n"
        "**Empate. Achávamos oculto, não é.** 5 dos 6 crus nomearam o NGBoost direto (o flash deu BART, "
        "uma alternativa probabilística válida). Para o pedido explícito de distribuição preditiva / "
        "CRPS, os LLMs lembram do NGBoost sozinhos. A ferramenta também o surfaca, mas não acrescenta "
        "nada. Lição: 'recente/nicho' não implica 'esquecido' - o NGBoost é nicho mas conhecido."
    ),
    "causal": (
        "| Concorrente | Nível | Nomeou |\n|---|---|---|\n"
        "| gemini-2.5-flash | básico | Causal Forest |\n| gpt-5-mini | básico | Causal Forest |\n"
        "| Claude Sonnet | básico | Causal Forest |\n| gemini-2.5-pro | fronteira | Causal Forest |\n"
        "| gpt-5 | fronteira | Causal Forest |\n| Claude Opus | fronteira | Causal Forest |\n"
        "| **Ferramenta** | — | Causal Forest, Double ML |\n\n"
        "**Empate total.** Os 6 crus nomearam Causal Forest para efeito heterogêneo a partir de dados "
        "observacionais. ML causal é nicho mas claramente dentro do que os LLMs sabem. A ferramenta "
        "surfaca os mesmos (Causal Forest + Double ML) e não agrega."
    ),
    "survival": (
        "| Concorrente | Nível | Nomeou |\n|---|---|---|\n"
        "| gemini-2.5-flash | básico | Random Survival Forest |\n| gpt-5-mini | básico | XGBoost AFT |\n"
        "| Claude Sonnet | básico | Random Survival Forest |\n| gemini-2.5-pro | fronteira | Random Survival Forest |\n"
        "| gpt-5 | fronteira | XGBoost Cox |\n| Claude Opus | fronteira | Random Survival Forest |\n"
        "| **Ferramenta** | — | DeepSurv |\n\n"
        "**Empate / movimento lateral.** Todos os crus deram um modelo de sobrevivência ML válido (RSF "
        "ou GB-survival); nenhum citou o DeepSurv. A ferramenta surfaca o DeepSurv - uma alternativa "
        "que os crus não escolheram, mas eles já tinham uma resposta ML forte. Não é ganho: os crus "
        "conhecem sobrevivência com ML; DeepSurv vs RSF é lateral, não uma lacuna preenchida. (O RSF, "
        "pick da maioria, nem está no conjunto de ocultos.)"
    ),
    "counts": (
        "| Concorrente | Nível | Nomeou |\n|---|---|---|\n"
        "| gemini-2.5-flash | básico | ZINB |\n| gpt-5-mini | básico | Hurdle NB |\n"
        "| Claude Sonnet | básico | ZINB |\n| gemini-2.5-pro | fronteira | ZINB |\n"
        "| gpt-5 | fronteira | ZINB |\n| Claude Opus | fronteira | Negative Binomial |\n"
        "| **Ferramenta** | — | nenhum oculto cabe |\n\n"
        "**Limite, e honesto.** A família contagem-com-zeros (NB / ZINB / Hurdle) é estatística "
        "clássica que os 6 crus acertam de cor. A ferramenta, filtrada ao conjunto de ocultos, **não "
        "encontra nenhum** modelo recente/nicho que caiba - e concorda: a resposta clássica é a certa. "
        "Não há nada a acrescentar, e a ferramenta não finge que há."
    ),
    "big_data_tabular": (
        "| Concorrente | Nível | Nomeou |\n|---|---|---|\n"
        "| gemini-2.5-flash | básico | LightGBM |\n| gpt-5-mini | básico | CatBoost |\n"
        "| Claude Sonnet | básico | XGBoost |\n| gemini-2.5-pro | fronteira | LightGBM |\n"
        "| gpt-5 | fronteira | CatBoost |\n| Claude Opus | fronteira | LightGBM |\n"
        "| **Ferramenta** | — | nenhum oculto compelativo |\n\n"
        "**Limite.** Big tabular = booster, que os 6 crus nomeiam de cor (LightGBM / CatBoost / "
        "XGBoost). Entre os ocultos, o TabPFN é contraindicado (n > 10k) e o NGBoost é para regressão "
        "probabilística - nenhum cabe de forma compelativa. A ferramenta corretamente não força nada e "
        "concorda com a resposta clássica."
    ),
}

# ---------------------------------------------------------------- coleta (cache incremental)
def gather_case(case):
    entry = {"tiers": {}}
    for tier, models in B.TIERS.items():
        gt, gu = B.call_gemini(case["prompt"], models["gemini"])
        ot, ou = B.call_openai(case["prompt"], models["openai"])
        entry["tiers"][tier] = {
            "gemini": {"model": models["gemini"], "text": gt, "cost": B.cost(gu)},
            "openai": {"model": models["openai"], "text": ot, "cost": B.cost(ou)},
        }
    return entry

def load(fresh=False):
    data = {} if (fresh or not RESULTS_JSON.exists()) else json.loads(RESULTS_JSON.read_text(encoding="utf-8"))
    changed = False
    for case in B.CASES:
        if case["name"] not in data:
            print(f"[{case['name']}] coletando (API)...")
            data[case["name"]] = gather_case(case)
            changed = True
    if changed:
        RESULTS_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return data

# ---------------------------------------------------------------- células
def md(text):
    lines = text.split("\n")
    return {"cell_type": "markdown", "metadata": {}, "source": [l + "\n" for l in lines[:-1]] + [lines[-1]]}

def code(text):
    lines = text.split("\n")
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [],
            "source": [l + "\n" for l in lines[:-1]] + [lines[-1]]}

KIND_LABEL = {
    "hidden-win": "GANHO (oculto que os crus esqueceram)",
    "partial": "PARCIAL (os crus surfaçam o oculto só em parte)",
    "tie-niche": "EMPATE (achávamos oculto, mas os crus nomeiam)",
    "boundary": "LIMITE (resposta clássica; nenhum oculto cabe)",
}

def tool_table(top):
    rows = ["| # | modelo oculto | ano | fitScore | razões |", "|---|---|---|---|---|"]
    for i, r in enumerate(top, 1):
        rows.append(f"| {i} | {r['name']} | {r['year']} | {r['fitScore']:+.2f} | {'; '.join(r['reasons'])} |")
    return "\n".join(rows)

def build_case(case, data):
    e = data[case["name"]]
    tool = B.tool_overlooked(case)
    ca, name = CLAUDE_ANSWERS[case["name"]], case["name"]
    alvo = ", ".join(case["target_hidden"]) or "(nenhum esperado)"
    cells = [
        md(f"# Benchmark de modelos ocultos — {case['title']}\n\n**Problema:** {case['prompt']}\n\n"
           f"**Tipo:** {KIND_LABEL[case['kind']]}\n\n**Modelo oculto em questão:** {alvo}"),
        md("## Metodologia\n\nConcorrentes **crus** (sem ferramenta, da própria memória) em dois níveis "
           "(básico: gemini-2.5-flash, gpt-5-mini, Claude Sonnet; fronteira: gemini-2.5-pro, gpt-5, "
           "Claude Opus). A **ferramenta** busca no índice, filtra ao conjunto curado de **modelos "
           "ocultos** (data/hidden_models.json) e reordena por `stat_fit`. Pergunta: o modelo crus "
           "lembra do oculto ideal, ou esquece? gemini/openai por API; Sonnet/Opus por subagente."),
        md("## Nível básico (crus)"),
        md(f"**gemini-2.5-flash**\n\n{e['tiers']['basic']['gemini']['text']}"),
        md(f"**gpt-5-mini**\n\n{e['tiers']['basic']['openai']['text']}"),
        md(f"**Claude Sonnet** ({ca['basic']['model']}, subagente)\n\n{ca['basic']['text']}"),
        md("## Nível fronteira (crus)"),
        md(f"**gemini-2.5-pro**\n\n{e['tiers']['frontier']['gemini']['text']}"),
        md(f"**gpt-5**\n\n{e['tiers']['frontier']['openai']['text']}"),
        md(f"**Claude Opus** ({ca['frontier']['model']}, subagente)\n\n{ca['frontier']['text']}"),
    ]
    if tool["ranked"]:
        cells.append(md(f"## Ferramenta (modelos ocultos que cabem)\n\nFiltrado ao conjunto de ocultos, "
                        f"reordenado por `stat_fit`. Candidatos ocultos recuperados: "
                        f"{tool['n_hidden_candidates']}.\n\n{tool_table(tool['ranked'])}\n\n"
                        f"**Oculto-alvo no top-3:** {'SIM' if tool['target_in_top3'] else 'NÃO'}"))
    else:
        cells.append(md("## Ferramenta (modelos ocultos que cabem)\n\n**Nenhum modelo oculto do conjunto "
                        "curado cabe neste problema.** A ferramenta concorda com os crus: a resposta "
                        "clássica é a certa, não há modelo recente/nicho a acrescentar."))
    cells.append(md(f"## Análise imparcial\n\n{ANALYSES.get(name, '_(a preencher)_')}"))
    cells.append(md("## Reprodução"))
    cells.append(code("import bench_lib as B\n"
                      f"case = B.case_by_name('{name}')\n"
                      "# cru (pago):\n"
                      "print(B.call_gemini(case['prompt'], B.TIERS['frontier']['gemini'])[0])\n"
                      "# ferramenta de ocultos (grátis):\n"
                      "import json; print(json.dumps(B.tool_overlooked(case), indent=2, ensure_ascii=False))"))
    nb = {"cells": cells, "metadata": {"language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 5}
    (HERE / f"case_{name}.ipynb").write_text(json.dumps(nb, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"case_{name}.ipynb escrito")

def main():
    data = load(fresh="--fresh" in sys.argv)
    for case in B.CASES:
        build_case(case, data)

if __name__ == "__main__":
    main()
