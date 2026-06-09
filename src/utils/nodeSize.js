/**
 * Tamanho do nó por profundidade.
 * A raiz é um caso especial: o dobro do tamanho-base.
 * Do nível 1 em diante, cada nível tem 80% da altura/largura do anterior.
 * Usado tanto pelo layout (espaçamento) quanto pelo render (Node.jsx).
 */
const BASE_W    = 340
const BASE_H    = 100
const ROOT_MULT = 2     // raiz = dobro do tamanho-base
const DECAY     = 0.8
const MIN_W     = 108
const MIN_H     = 32

export function nodeSize(depth) {
  if (depth === 0) {
    return { w: BASE_W * ROOT_MULT, h: BASE_H * ROOT_MULT }
  }
  // nível 1 usa o tamanho-base; cada nível seguinte é 80% do anterior,
  // mas a diminuição para no 3º grau — do 4º em diante mantém o tamanho do 3º
  const d = Math.min(depth, 3)
  const factor = Math.pow(DECAY, d - 1)
  const w = Math.max(MIN_W, BASE_W * factor)
  const h = Math.max(MIN_H, BASE_H * factor)
  return { w, h }
}

// Espessura do galho que sai de um nó nesta profundidade (tronco grosso, ramos finos)
export function linkWidth(depth) {
  return Math.max(1.5, 6 * Math.pow(DECAY, depth))
}

// Fonte proporcional à altura do nó, com piso de legibilidade
export function fontSize(depth) {
  const { h } = nodeSize(depth)
  return Math.max(11, Math.min(28, Math.round(h * 0.22)))
}

const CHAR_W_RATIO = 0.56  // largura média do caractere relativa ao fontSize
const PAD_X        = 22    // padding horizontal interno (esquerda+direita)
const PAD_Y        = 16    // padding vertical interno (topo+base)
const LINE_RATIO   = 1.3   // altura da linha relativa ao fontSize

// Quebra o rótulo em linhas que cabem na largura do nó (heurística por caractere).
export function wrapLabel(text, w, fs) {
  const maxChars = Math.max(6, Math.floor((w - PAD_X) / (fs * CHAR_W_RATIO)))
  const words = String(text).split(/\s+/)
  const lines = []
  let cur = ''
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word
    if (test.length <= maxChars) { cur = test; continue }
    if (cur) { lines.push(cur); cur = '' }
    if (word.length > maxChars) {
      // palavra única maior que a linha: corta em pedaços
      let rest = word
      while (rest.length > maxChars) { lines.push(rest.slice(0, maxChars)); rest = rest.slice(maxChars) }
      cur = rest
    } else {
      cur = word
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

/**
 * Medição completa do nó: largura fixa por profundidade, altura cresce com a
 * quebra de linha do texto. Usado pelo render (Node) e pelo layout (espaçamento).
 * Memoizado — o resultado é puro em (name, depth) e é consultado a cada frame.
 */
const measureCache = new Map()
export function measureNode(name, depth) {
  const key = `${depth}|${name}`
  const cached = measureCache.get(key)
  if (cached) return cached

  const { w, h: baseH } = nodeSize(depth)
  const fs = fontSize(depth)
  const lines = wrapLabel(name, w, fs)
  const lineHeight = fs * LINE_RATIO
  const h = Math.max(baseH, lines.length * lineHeight + PAD_Y)
  const result = { w, h, lines, fontSize: fs, lineHeight }
  measureCache.set(key, result)
  return result
}
