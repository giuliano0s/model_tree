# CLAUDE.md — models-tree

Arquivo de contexto para Claude Code. Leia antes de qualquer tarefa neste projeto.

---

## O que é este projeto

Visualizador interativo da árvore categórica de modelos preditivos em ML, IA/Deep Learning e Estatística Clássica. Navega pelos 365 modelos catalogados, mostra metadados ricos de cada nó num painel flutuante e permite reorganizar o layout livremente (arrastar nós e galhos) e salvar essa organização como padrão.

Fonte de dados: um único JSON. Frontend em D3 (cálculo) + React (render), SVG.

---

## Stack

- **Vite** — bundler e dev server (com plugin custom para gravar layout)
- **React 18** — UI
- **D3.js v7** — `hierarchy`, `tree`, `zoom` (apenas cálculo; D3 nunca toca no DOM)
- **CSS Modules** — estilização por componente
- **Sem bibliotecas de componentes nem de árvore** — tudo feito do zero

---

## Estado atual

**Implementado e funcionando:**
- Árvore completa renderizada em SVG, com zoom/pan
- Nós com tamanho por profundidade, quebra de texto e cor espectral
- Galhos como curvas Bézier suaves, com ponto de controle arrastável
- Arraste de nó (move nó + subárvore) e de galho (molda a curva)
- Persistência de layout (offsets de nós e galhos) em `data/layout.json`
- DetailPanel flutuante com os metadados do nó
- Controls (zoom +/−/enquadrar, Salvar layout, Resetar)

**Pendente:**
- `NavSidebar` (navegação lateral esquerda) — hoje é placeholder em `App.jsx`
- UI da busca (`SearchBar`) — o hook `useSearch` existe, falta o componente
- Deploy

---

## Estrutura de pastas (real)

```
models-tree/
├── data/
│   ├── models_tree.pt.json      # master PT — 365 nós (ml, ai, st)
│   ├── models_tree.en.json      # tradução EN (e .<lang>.json para outros idiomas)
│   ├── languages.json           # manifesto de idiomas: [{code,name}] (auto-descoberta)
│   ├── models_tree.backup.json  # backup da versão antiga incompleta (239 nós, só ml)
│   └── layout.json              # offsets manuais salvos: { nodes, links }
├── src/
│   ├── components/
│   │   ├── Tree/
│   │   │   ├── index.jsx        # monta SVG, posições efetivas, ancoragem do painel, fecha-no-fundo
│   │   │   ├── Node.jsx         # retângulo arredondado + texto (quebra de linha) + arraste
│   │   │   ├── Link.jsx         # curva Bézier suave + ponto de controle arrastável
│   │   │   └── Tree.module.css
│   │   ├── Controls/
│   │   │   ├── index.jsx        # zoom, Salvar layout, Resetar
│   │   │   └── Controls.module.css
│   │   └── DetailPanel/
│   │       ├── index.jsx        # painel flutuante de metadados
│   │       └── DetailPanel.module.css
│   ├── hooks/
│   │   ├── useTreeLayout.js     # layout base top-down (d3.hierarchy + cascata de y)
│   │   ├── useZoom.js           # d3.zoom (ZOOM_MIN 0.03), reset/fit, zoomIn/Out
│   │   ├── useSearch.js         # filtragem por nome/id (matchIds + ancestorIds)
│   │   └── useCollapse.js       # NÃO USADO (colapso foi removido — ver decisões)
│   ├── utils/
│   │   ├── treeUtils.js         # flattenTree, findById, getPath, filterByQuery, applyCollapse
│   │   ├── colorUtils.js        # buildColorMap (3 arco-íris), toHsl, borderColor
│   │   └── nodeSize.js          # nodeSize, fontSize, linkWidth, wrapLabel, measureNode
│   ├── styles/{global.css, tokens.css}
│   ├── App.jsx                  # estado raiz: dados, offsets, save/load de layout
│   ├── App.module.css
│   └── main.jsx
├── index.html
├── vite.config.js               # plugin layoutSaver (POST /api/save-layout) + publicDir
├── package.json
└── CLAUDE.md
```

> Não existem mais `d3Config.js`, `NavSidebar/` nem `SearchBar/` — o `nodeSize.js` cobre as constantes de dimensão, e os dois últimos ainda serão criados.

---

## Dados

### models_tree.<lang>.json

Um arquivo por idioma em `./data/` (servido estático via `publicDir: 'data'`).
`models_tree.pt.json` é o **master** (PT); `models_tree.en.json` etc. são traduções.
O app carrega `models_tree.<lang>.json` com fallback para `models_tree.pt.json`.
Acesso sempre via `fetch`, nunca `import`.

- 365 nós · 297 folhas · 68 intermediários
- 3 ramos na raiz: `ml`, `ai`, `st`
- Schema do nó: `id`, `name`, `year`, `diff_siblings`, `strengths[]`, `weaknesses[]`, `recommended_for[]`, `not_recommended_for[]`, `curiosity`, `children[]`
- Folhas: `l001`–`l297`. Intermediários: slugs (`ml-reg`, `ai-tr-nlp`, …). `id` único — usado como React key.
- Encoding UTF-8 correto. Há um `Ã` legítimo (notação matemática `ÃHW` no GCN), não é mojibake.

### layout.json

Disposição salva do usuário, formato `{ nodes, links }`:
- `nodes`: `{ [id]: { dx, dy } }` — deslocamento de cada nó (em unidades SVG)
- `links`: `{ ["src->tgt"]: { ox, oy } }` — deslocamento do ponto de controle de cada galho

Carregado no boot e usado como **padrão** (alvo do Reset). Formato antigo (mapa plano = só nós) ainda é aceito.

---

## Decisões de arquitetura e design

### D3 calcula, React renderiza
D3 só faz: `hierarchy`, cálculo de posições e `zoom` (via `useRef` no `<g>`). Nunca `d3.select` para criar/alterar elementos. Resultado vira props para componentes React.

### Layout: base top-down + offsets manuais = radial (estado atual)
- `useTreeLayout` calcula um layout **base top-down**: raiz no topo, filhos descendo, empilhados verticalmente usando a **altura real** de cada nó (que varia com a quebra de texto), de forma que nenhum filho fique acima do pai.
- Por cima desse base, cada nó recebe um **offset de arraste**. A posição efetiva de um nó = base + soma dos offsets de **todos os ancestrais** (inclusive ele) → arrastar um nó move ele e toda a subárvore.
- O `layout.json` atual reorganiza tudo num formato **radial ("árvore vista de cima")**: raiz central e ramos abrindo em 360° ao redor. Ou seja, a orientação visual final é definida pelos offsets salvos, não pelo algoritmo base.
- Consequência: a regra "nenhum filho acima do pai" vale só no layout base; no layout salvo (radial) ela não se aplica.
- **Pendência conhecida:** as curvas dos galhos (`Link.jsx`) dobram no meio **vertical** (pensadas para top-down). Num arranjo radial, galhos laterais/para cima curvam de forma estranha. Trocar por curva radial-aware é um próximo passo em aberto.

### Sem colapso — árvore sempre expandida
Não há expandir/colapsar. `useTreeLayout` recebe um `Set` vazio fixo (`NO_COLLAPSE`). `useCollapse.js` permanece no repo mas **não é usado**.

### Nós
- Retângulos arredondados (`<rect rx>`), nunca círculos.
- Tamanho por profundidade em `nodeSize.js`: raiz = dobro do tamanho-base; do nível 1 em diante cada nível é 80% do anterior, **mas a diminuição congela no 3º grau** (4º em diante = tamanho do 3º).
- **Quebra de linha:** `wrapLabel`/`measureNode` quebram o nome em várias linhas conforme a largura; a **altura cresce** para caber o texto. A mesma medição é usada no render e no layout (para o espaçamento não sobrepor).
- **Texto branco com contorno escuro** (`fill #fff` + `stroke rgba(0,0,0,.85)` + `paint-order: stroke`) — legível em qualquer cor de fundo.

### Cores — três arco-íris, paleta sofisticada
`buildColorMap` em `colorUtils.js`:
- Raiz neutra (quase branca).
- **Cada filho da raiz (`ml`, `ai`, `st`) recebe a roda de cor INTEIRA (360°)** — cada ramo tem seu próprio arco-íris — apenas girada 120° por ramo para os três não ficarem idênticos.
- Dentro de cada ramo, a fatia de matiz é subdividida recursivamente entre os filhos (folhas da mesma família podem repetir cor — ok).
- **Filtro "sofisticado":** saturação e luminosidade médias e em faixa estreita (`sat ≈ 53–60%`, `light ≈ 50–60%`), evitando cores cruas ou escuras demais.
- `borderColor` = versão ~15% mais escura da cor do nó.

### Galhos (links)
- Curva **cubic Bézier suave** (sem ângulos).
- **Ponto de controle arrastável nos 2 eixos** (`ox`, `oy`): pega-se o galho (faixa de hit invisível de 18px) e arrasta — `oy` sobe/desce a inflexão, `ox` inclina a curva para os lados.
- Espessura por profundidade (`linkWidth`): tronco grosso, ramos finos.

### DetailPanel
Abre ao clicar num nó, **ao lado dele** (prefere a direita; cai para a esquerda ou o lado com mais espaço; clampado para nunca sair da tela). Segue o nó ao dar zoom/pan. Campos, nesta ordem: `name`+`year`, `diff_siblings` (destaque), `strengths` (✓), `weaknesses` (✕), `recommended_for` (→), `not_recommended_for` (⊘), `curiosity` (💡). É HTML sobreposto (não SVG) — texto nítido e com scroll.

### Interações (resumo)
- **Clicar** num nó → abre o painel. **Arrastar** um nó → move nó + subárvore.
- **Arrastar** um galho → molda a curva daquele galho.
- **Pan** com arraste no fundo, **zoom** com scroll (mín. 0.03 — afasta bastante).
- Clique no fundo (sem arrastar) ou no **X** fecha o painel; arrastar (pan) **não** fecha. Distinção por movimento < 4px.
- Clique vs. arraste em nós também usa limiar de 4px (`CLICK_THRESHOLD`).

### Persistência de layout
- Offsets de nós e galhos vivem em estado no `App.jsx`.
- **Autosave** contínuo no `localStorage` (rascunho) enquanto se arruma.
- **"Salvar layout"** grava `data/layout.json` direto no disco via endpoint do Vite (`POST /api/save-layout`); fallback para download se o endpoint não existir (build/preview). Ao salvar, o estado atual vira o novo **padrão**.
- **"Resetar"** volta ao **layout salvo** (padrão), não ao automático.
- Prioridade no boot: `localStorage` (rascunho) > `data/layout.json` > layout base automático.

### Independência de resolução
Todas as posições, offsets e curvas são em **coordenadas SVG** (não pixels). Ao arrastar, o delta em pixels é dividido pela escala do zoom antes de virar offset. Logo o `layout.json` produz o **mesmo arranjo relativo em qualquer monitor** — só o zoom inicial de enquadramento varia com o tamanho da viewport.

---

## vite.config.js

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// + plugin layoutSaver: middleware que trata POST /api/save-layout e grava data/layout.json

export default defineConfig({
  plugins: [react(), layoutSaver()],
  publicDir: 'data',   // serve ./data como estático → fetch('/models_tree.json'), fetch('/layout.json')
})
```

O endpoint `/api/save-layout` só existe no **dev server**. Mudanças no `vite.config.js` exigem reiniciar `npm run dev`.

---

## Ambiente local

- Node.js portátil em `C:\Users\giulianoos\node` (sem admin). **Não está no PATH do sistema** — o terminal integrado do VSCode não o herda.
  - Rodar fora do VSCode ou setar `terminal.integrated.env.windows.PATH` nas settings.
  - `$env:PATH = "C:\Users\giulianoos\node;$env:PATH"; npm run dev`
- Python 3.12 no PATH (usado para inspeção/edição de dados).
- Dev server: `npm run dev` → `http://localhost:5173`.
- Venv Python em `.venv/` (para os scripts) com `openai` + `python-dotenv`
  (`pip install -r scripts/requirements.txt`). Chave da API em `.env` na raiz
  (`CEREBRAS_API_KEY=...`), fora do git.

---

## Idiomas (i18n)

Há duas camadas independentes:

1. **Interface** — tabelas de tradução em `src/i18n.jsx` (`STRINGS.<lang>`), acessadas
   via `useLang()` → `t('chave')`. Idioma persistido em `localStorage` (`modeltree.lang`),
   padrão `en`. Fallback de `t`: idioma ativo → `en` → `pt` → a própria chave.
2. **Dados** — um arquivo por idioma em `data/`:
   - `models_tree.pt.json` = master **PT**
   - `models_tree.<lang>.json` = traduções (ex: `models_tree.en.json`)
   - O `App` carrega `models_tree.<lang>.json` com **fallback** para `models_tree.pt.json`.
     Os `id` são iguais entre idiomas, então o layout salvo continua válido.

**Auto-descoberta de idiomas (manifesto):** `data/languages.json` é uma lista
`[{ code, name }]` que o `LangProvider` busca no boot para montar o **dropdown**
da `NavSidebar` (não há lista hardcoded de idiomas). O script de tradução
**atualiza esse manifesto** sozinho ao gerar um idioma novo. Em hospedagem estática
não dá para listar a pasta `data/`, por isso o manifesto é necessário.

### Gerar a tradução dos dados (Cerebras)

`scripts/translate_tree.py` traduz os campos de texto via Cerebras (modelos:
`gpt-oss-120b`, `zai-glm-4.7`), em **lotes** (free tier ≈ 5 req/min) com glossário
de termos técnicos e cache incremental (`scripts/translations.<lang>.json`).

```powershell
# pt -> en (default). Use a venv:
.\.venv\Scripts\python scripts\translate_tree.py en
# pt -> es:
.\.venv\Scripts\python scripts\translate_tree.py es
# en -> fr (usa models_tree.en.json como fonte):
.\.venv\Scripts\python scripts\translate_tree.py fr en
```
Ajustes via env: `CEREBRAS_MODEL`, `BATCH_SIZE`, `REQUEST_INTERVAL`.
(Documentação detalhada no docstring no topo do script.)

### Adicionar um idioma novo (ex: Espanhol)

1. **Rodar o script:** `.\.venv\Scripts\python scripts\translate_tree.py es`
   → cria `data/models_tree.es.json` **e** adiciona `es` em `data/languages.json`.
   Pronto: o dropdown já mostra o idioma e os dados aparecem traduzidos.
2. **(Opcional) Interface em es:** adicionar uma tabela `STRINGS.es` em `src/i18n.jsx`
   (~30 chaves). Sem ela, os botões/painel caem no `en` (fallback) — os dados já
   ficam em es de qualquer forma.

Ou seja: os **dados** são totalmente data-driven (passo 1, zero código). Só a
tradução da **interface** continua no código (passo 2, opcional).

---

## Regra de ouro

O frontend é **orientado a dados**. Qualquer alteração no `models_tree.json` (adicionar, renomear, reestruturar nó) reflete automaticamente no visual sem mudar código: cor, tamanho, quebra de texto e layout base são todos computados a partir da posição/conteúdo do nó. Nenhum `id`, nome ou estrutura é hardcoded nos componentes. (Único acoplamento de schema: o `DetailPanel` precisa de ajuste manual se um campo **novo** for adicionado ao JSON e precisar ser exibido.)
