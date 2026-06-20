import { useRef, useEffect, useMemo, useCallback } from 'react'
import { useTreeLayout } from '../../hooks/useTreeLayout.js'
import { useZoom } from '../../hooks/useZoom.js'
import { flattenTree } from '../../utils/treeUtils.js'
import { measureNode } from '../../utils/nodeSize.js'
import Node from './Node.jsx'
import Link from './Link.jsx'
import Controls from '../Controls/index.jsx'
import DetailPanel from '../DetailPanel/index.jsx'
import styles from './Tree.module.css'

const NO_COLLAPSE = new Set()

export default function Tree({
  rootData,
  colorMap,
  selectedNode,
  searchActive,
  matchIds,
  ancestorIds,
  offsets,
  linkOffsets,
  saveStatus,
  focusReq,
  panelClosing,
  onNodeClick,
  onDrag,
  onLinkDrag,
  onSaveLayout,
  onResetLayout,
  onHardReset,
  onCloseDetail,
  onPanelExited,
  onAbout,
  dimmedId,
}) {
  const svgRef   = useRef(null)
  const groupRef = useRef(null)
  const bgDown   = useRef(null)
  const scaleRef = useRef(1)

  const { nodes, links } = useTreeLayout(rootData, NO_COLLAPSE)
  const { transform, centerOn, reset, zoomIn, zoomOut } = useZoom(svgRef, groupRef)
  // escala atual disponível para os handlers de arraste sem re-renderizar os nós
  scaleRef.current = transform.k

  const intermediateIds = useMemo(() => {
    const all = flattenTree(rootData)
    return new Set(all.filter(n => n.children).map(n => n.id))
  }, [rootData])

  // Posição efetiva = layout + soma dos offsets de todos os ancestrais (inclusive o próprio).
  // Arrastar um nó move ele e toda a subárvore.
  const posMap = useMemo(() => {
    const map = new Map()
    for (const n of nodes) {
      let dx = 0, dy = 0
      for (const a of n.ancestors()) {
        const o = offsets.get(a.data.id)
        if (o) { dx += o.dx; dy += o.dy }
      }
      map.set(n.data.id, { x: n.displayX + dx, y: n.displayY + dy })
    }
    return map
  }, [nodes, offsets])

  // Enquadra a árvore inteira (posições efetivas) na viewport
  const fitView = useCallback(() => {
    if (!svgRef.current || posMap.size === 0) return
    const { clientWidth, clientHeight } = svgRef.current
    const padding = 80
    const pts = [...posMap.values()]
    const xs = pts.map(p => p.x)
    const ys = pts.map(p => p.y)
    const visW = Math.max(...xs) - Math.min(...xs) + 160 + padding * 2
    const visH = Math.max(...ys) - Math.min(...ys) + 44  + padding * 2
    reset(clientWidth, clientHeight, visW, visH)
  }, [posMap, reset])

  // Enquadra na montagem
  useEffect(() => {
    if (nodes.length > 0) fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootData])

  // Foca + dá zoom num nó quando a navbar pede (focusReq)
  useEffect(() => {
    if (!focusReq || !svgRef.current) return
    const p = posMap.get(focusReq.id)
    const nObj = nodes.find(n => n.data.id === focusReq.id)
    if (!p || !nObj) return
    const { clientWidth, clientHeight } = svgRef.current
    const { w } = measureNode(nObj.data.name, nObj.depth)
    // escala para o nó ocupar ~340px de largura na tela, dentro de limites
    const scale = Math.max(0.3, Math.min(1.4, 340 / w))
    centerOn(p.x, p.y, scale, clientWidth, clientHeight)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReq])

  // Fechar o painel ao tocar no fundo (sem arrastar)
  function handleBgDown(e) {
    const tag = e.target.tagName
    bgDown.current = (tag === 'svg' || tag === 'g') ? { x: e.clientX, y: e.clientY } : null
  }
  function handleBgUp(e) {
    if (!bgDown.current) return
    const moved = Math.abs(e.clientX - bgDown.current.x) + Math.abs(e.clientY - bgDown.current.y)
    bgDown.current = null
    if (moved < 4) onCloseDetail()
  }

  // Dados de ancoragem do painel: posição do nó na tela (segue o zoom/pan)
  let panelData = null
  if (selectedNode && svgRef.current) {
    const sp = posMap.get(selectedNode.id)
    const nObj = nodes.find(n => n.data.id === selectedNode.id)
    if (sp && nObj) {
      const { w, h } = measureNode(selectedNode.name, nObj.depth)
      const k = transform.k
      const cx = transform.x + sp.x * k
      const cy = transform.y + sp.y * k
      const halfW = (w / 2) * k
      const halfH = (h / 2) * k
      panelData = {
        anchor: { left: cx - halfW, right: cx + halfW, cx, cy },
        container: { w: svgRef.current.clientWidth, h: svgRef.current.clientHeight },
      }
    }
  }

  // Listas memoizadas: zoom/pan (que só muda transform) NÃO as rebuilda.
  const renderedLinks = useMemo(() => links.map(link => {
    const s = posMap.get(link.source.data.id)
    const t = posMap.get(link.target.data.id)
    if (!s || !t) return null
    const linkId = `${link.source.data.id}->${link.target.data.id}`
    const lo = linkOffsets.get(linkId)
    return (
      <Link
        key={linkId}
        id={linkId}
        sx={s.x} sy={s.y} tx={t.x} ty={t.y}
        ox={lo?.ox ?? 0}
        oy={lo?.oy ?? 0}
        color={colorMap.get(link.source.data.id)}
        depth={link.source.depth}
        scaleRef={scaleRef}
        onLinkDrag={onLinkDrag}
      />
    )
  }), [links, posMap, colorMap, linkOffsets, onLinkDrag])

  const selId = selectedNode?.id
  const renderedNodes = useMemo(() => nodes.map(node => {
    const p = posMap.get(node.data.id)
    return (
      <Node
        key={node.data.id}
        node={node}
        x={p.x}
        y={p.y}
        scaleRef={scaleRef}
        colorMap={colorMap}
        isSelected={selId === node.data.id}
        hasChildren={intermediateIds.has(node.data.id)}
        searchActive={searchActive}
        isMatch={matchIds.has(node.data.id)}
        isAncestor={ancestorIds.has(node.data.id)}
        isDimmed={node.data.id === dimmedId}
        onNodeClick={onNodeClick}
        onDrag={onDrag}
      />
    )
  }), [nodes, posMap, colorMap, selId, intermediateIds, searchActive, matchIds, ancestorIds, dimmedId, onNodeClick, onDrag])

  return (
    <div className={styles.container}>
      <svg
        ref={svgRef}
        className={styles.svg}
        onPointerDown={handleBgDown}
        onPointerUp={handleBgUp}
      >
        <g ref={groupRef}>
          {renderedLinks}
          {renderedNodes}
        </g>
      </svg>

      <Controls
        saveStatus={saveStatus}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={fitView}
        onSaveLayout={onSaveLayout}
        onResetLayout={onResetLayout}
        onHardReset={onHardReset}
        onAbout={onAbout}
      />

      {selectedNode && panelData && (
        <DetailPanel
          key={selectedNode.id}
          node={selectedNode}
          anchor={panelData.anchor}
          container={panelData.container}
          closing={panelClosing}
          onClose={onCloseDetail}
          onExited={onPanelExited}
        />
      )}
    </div>
  )
}
