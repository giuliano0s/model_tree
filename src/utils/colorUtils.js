/**
 * Sistema de cores espectral.
 *
 * A raiz é neutra. Os ramos do topo são distribuídos em torno da roda de cor
 * (com deslocamento para a esquerda começar em tom frio, não vermelho).
 * Cada nó abre seus filhos num leque centrado na própria hue, com amplitude
 * que encolhe por nível mas tem um PISO — assim subárvores profundas nunca
 * colapsam numa cor única. A luminosidade também varia entre irmãos.
 */

const ROOT_COLOR = { h: 0, s: 0, l: 94 }

const norm = (h) => ((h % 360) + 360) % 360

/**
 * Constrói um mapa id → cor percorrendo a árvore recursivamente.
 *
 * A raiz é neutra. Cada um dos seus filhos (ml, ai, st) recebe a roda de cor
 * INTEIRA (360°) — ou seja, cada ramo principal tem seu próprio arco-íris
 * completo — apenas girada por ramo para os três não ficarem idênticos.
 * Dentro de cada ramo, a fatia é subdividida entre os filhos como antes.
 */
export function buildColorMap(node, hueStart = 0, hueRange = 360, depth = 0) {
  const map = new Map()

  if (depth === 0) {
    map.set(node.id, ROOT_COLOR)
    const branches = node.children ?? []
    const n = branches.length
    branches.forEach((branch, i) => {
      // cada ramo recebe a roda inteira, girada por (360/n) para diferenciá-los
      const childMap = buildColorMap(branch, (360 * i) / n, 360, depth + 1)
      childMap.forEach((v, k) => map.set(k, v))
    })
    return map
  }

  const hue = hueStart + hueRange / 2
  // Paleta "sofisticada": saturação e luminosidade médias, em faixa estreita.
  // Mantém as matizes; só evita cores cruas (saturadas demais) ou escuras demais.
  const saturation = Math.min(48 + depth * 5, 60)
  const lightness  = Math.max(60 - depth * 3, 50)
  map.set(node.id, { h: norm(hue), s: saturation, l: lightness })

  if (node.children && node.children.length > 0) {
    const sliceSize = hueRange / node.children.length
    node.children.forEach((child, i) => {
      const childStart = hueStart + i * sliceSize
      const childMap = buildColorMap(child, childStart, sliceSize, depth + 1)
      childMap.forEach((v, k) => map.set(k, v))
    })
  }

  return map
}

/**
 * Converte { h, s, l } para string CSS hsl().
 */
export function toHsl({ h, s, l }, alpha = 1) {
  if (alpha < 1) return `hsla(${h.toFixed(1)}, ${s}%, ${l}%, ${alpha})`
  return `hsl(${h.toFixed(1)}, ${s}%, ${l}%)`
}

/**
 * Retorna a cor de texto adequada (escura ou clara) para um dado fundo.
 */
export function textColor({ l }) {
  return l > 55 ? '#0f0f0f' : '#f0f0f0'
}

/**
 * Retorna a cor de borda (versão mais escura da cor do nó).
 */
export function borderColor({ h, s, l }) {
  return `hsl(${h.toFixed(1)}, ${s}%, ${Math.max(l - 15, 15)}%)`
}
