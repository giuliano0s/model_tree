/**
 * Retorna todos os nós da árvore em um array flat.
 * Cada item recebe `depth` e `parentId` para facilitar navegação.
 */
export function flattenTree(node, depth = 0, parentId = null) {
  const result = [{ ...node, depth, parentId }]
  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenTree(child, depth + 1, node.id))
    }
  }
  return result
}

/**
 * Busca um nó pelo id. Retorna o nó ou null.
 */
export function findById(node, id) {
  if (node.id === id) return node
  if (!node.children) return null
  for (const child of node.children) {
    const found = findById(child, id)
    if (found) return found
  }
  return null
}

/**
 * Retorna o caminho da raiz até o nó com o id dado.
 * Ex: ['root', 'ml', 'ml-sup', 'l001']
 */
export function getPath(node, id, path = []) {
  const current = [...path, node.id]
  if (node.id === id) return current
  if (!node.children) return null
  for (const child of node.children) {
    const found = getPath(child, id, current)
    if (found) return found
  }
  return null
}

// minúsculas + remove acentos/diacríticos e traços para comparação tolerante
const fold = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-–—]/g, '')

/**
 * Filtra nós cujo name ou id contenha a query (case-insensitive e
 * insensível a acentos: "regressao" casa "Regressão").
 * Retorna um Set de ids que correspondem.
 */
export function filterByQuery(node, query) {
  const q = fold(query).trim()
  const matches = new Set()
  if (!q) return matches

  function walk(n) {
    if (fold(n.name).includes(q) || fold(n.id).includes(q)) {
      matches.add(n.id)
    }
    if (n.children) n.children.forEach(walk)
  }

  walk(node)
  return matches
}

/**
 * Dado um Set de ids colapsados, retorna uma cópia da árvore
 * com os filhos dos nós colapsados removidos — pronto para d3.hierarchy.
 */
export function applyCollapse(node, collapsed) {
  if (!node.children) return node
  if (collapsed.has(node.id)) return { ...node, children: undefined }
  return {
    ...node,
    children: node.children.map(child => applyCollapse(child, collapsed)),
  }
}
