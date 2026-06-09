import { useMemo } from 'react'
import * as d3 from 'd3'
import { applyCollapse } from '../utils/treeUtils.js'
import { measureNode } from '../utils/nodeSize.js'

const NODE_WIDTH  = 160
const NODE_HEIGHT = 44
const SIBLING_GAP = -120 // sobreposição horizontal — irmãos muito próximos

// Conta folhas visíveis no subtree (após colapso)
function leafCount(node) {
  if (!node.children) return 1
  return node.children.reduce((s, c) => s + leafCount(c), 0)
}

// Retorna parâmetros de espaçamento dependendo do nível e do tipo de filhos.
// siblingVGap é o respiro EXTRA entre irmãos; a altura do nó é somada à parte.
function gapParams(depth, childrenAreLeaves) {
  if (childrenAreLeaves) return { levelGap: 240, yPerLeaf: 0,  siblingVGap: 14 }
  if (depth === 0)       return { levelGap: 60,  yPerLeaf: 10, siblingVGap: 12 }
  if (depth === 1)       return { levelGap: 80,  yPerLeaf: 12, siblingVGap: 14 }
  return                        { levelGap: 120, yPerLeaf: 24, siblingVGap: 40 }
}

// altura real do nó (com quebra de linha do texto)
const measuredH = (node, depth) => measureNode(node.data.name, depth).h

// Atribui displayY top-down: pai sempre acima dos filhos.
// Empilha os filhos usando a altura REAL de cada um (que varia com a quebra de texto).
function assignDisplayY(node, centerY, depth = 0) {
  node.displayY = centerY
  if (!node.children) return

  const childrenAreLeaves = node.children.every(c => !c.children)
  const { levelGap, yPerLeaf, siblingVGap } = gapParams(depth, childrenAreLeaves)

  const parentH = measuredH(node, depth)
  let cursor = centerY + parentH / 2 + levelGap   // topo da faixa dos filhos
  for (const child of node.children) {
    const ch = measuredH(child, depth + 1)
    const childCenter = cursor + ch / 2
    assignDisplayY(child, childCenter, depth + 1)
    // próximo irmão: abaixo deste + respiro + peso da subárvore
    cursor = childCenter + ch / 2 + siblingVGap + child._leafCount * yPerLeaf
  }
}

export function useTreeLayout(rootData, collapsed) {
  const { nodes, links, width, height } = useMemo(() => {
    if (!rootData) return { nodes: [], links: [], width: 0, height: 0 }

    const visible = applyCollapse(rootData, collapsed)
    const root = d3.hierarchy(visible)

    // d3.tree() para posições x (spread horizontal entre irmãos)
    d3.tree().nodeSize([NODE_WIDTH + SIBLING_GAP, 1])(root)

    // Pré-calcula leafCount em cada nó para evitar recálculo
    root.each(n => { n._leafCount = leafCount(n) })

    // Atribui y top-down — nenhum filho fica acima do pai
    assignDisplayY(root, 0, 0)

    const nodes = root.descendants()
    const links = root.links()

    // Bounding box com coordenadas finais
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    for (const n of nodes) {
      if (n.x        < minX) minX = n.x
      if (n.x        > maxX) maxX = n.x
      if (n.displayY < minY) minY = n.displayY
      if (n.displayY > maxY) maxY = n.displayY
    }

    const padding = 80
    const width  = (maxX - minX) + NODE_WIDTH  + padding * 2
    const height = (maxY - minY) + NODE_HEIGHT + padding * 2

    const offsetX = -minX + padding + NODE_WIDTH  / 2
    const offsetY = -minY + padding

    for (const n of nodes) {
      n.displayX = n.x + offsetX
      n.displayY = n.displayY + offsetY
    }

    return { nodes, links, width, height }
  }, [rootData, collapsed])

  return { nodes, links, width, height }
}
