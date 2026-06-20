import { useRef, memo } from 'react'
import { toHsl, borderColor } from '../../utils/colorUtils.js'
import { measureNode } from '../../utils/nodeSize.js'

const CLICK_THRESHOLD = 4  // px de movimento abaixo do qual é clique, não drag

function Node({
  node,
  x,
  y,
  scaleRef,
  colorMap,
  isSelected,
  hasChildren,
  searchActive,
  isMatch,
  isAncestor,
  isDimmed,
  onNodeClick,
  onDrag,
}) {
  const isRoot = node.data.id === 'root'
  const { w, h, lines, fontSize: fSize, lineHeight } = measureNode(node.data.name, node.depth)
  const radius = Math.min(18, h * 0.4)

  const color = colorMap.get(node.data.id) ?? { h: 0, s: 0, l: 94 }
  const fill   = toHsl(color)
  const border = borderColor(color)
  const strokeW = Math.max(2.5, fSize * 0.16)  // contorno escuro do texto

  let opacity = 1
  if (searchActive && !isMatch && !isAncestor) opacity = 0.15
  else if (isDimmed) opacity = 0.55  // nó-surpresa: apagado, como quem estava escondido

  const ringColor = isSelected ? border : 'transparent'
  const ringWidth = isSelected ? 2.5 : 0

  const drag = useRef(null)

  function handlePointerDown(e) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { lastX: e.clientX, lastY: e.clientY, moved: 0 }
  }

  function handlePointerMove(e) {
    if (!drag.current) return
    const dxScreen = e.clientX - drag.current.lastX
    const dyScreen = e.clientY - drag.current.lastY
    drag.current.lastX = e.clientX
    drag.current.lastY = e.clientY
    drag.current.moved += Math.abs(dxScreen) + Math.abs(dyScreen)
    // converte delta de tela para o espaço SVG dividindo pela escala do zoom
    const k = scaleRef.current || 1
    onDrag(node.data.id, dxScreen / k, dyScreen / k)
  }

  function handlePointerUp(e) {
    const st = drag.current
    drag.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    if (st && st.moved < CLICK_THRESHOLD) {
      onNodeClick(node.data)
    }
  }

  return (
    <g
      transform={`translate(${x},${y})`}
      opacity={opacity}
      style={{ transition: 'opacity 200ms ease' }}
    >
      {/* anel de seleção */}
      <rect
        x={-w / 2 - 4}
        y={-h / 2 - 4}
        width={w + 8}
        height={h + 8}
        rx={radius + 4}
        fill="none"
        stroke={ringColor}
        strokeWidth={ringWidth}
        style={{ transition: 'stroke 150ms ease' }}
        pointerEvents="none"
      />

      {/* corpo do nó — clica para abrir painel, arrasta para mover subárvore */}
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={radius}
        fill={fill}
        stroke={border}
        strokeWidth={1}
        cursor="grab"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* label com quebra de linha — branco com contorno escuro */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill="#ffffff"
        stroke="rgba(0,0,0,0.85)"
        strokeWidth={strokeW}
        paintOrder="stroke"
        strokeLinejoin="round"
        fontSize={fSize}
        fontWeight={isRoot ? 600 : hasChildren ? 500 : 400}
        fontFamily="Inter, sans-serif"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={0} y={(i - (lines.length - 1) / 2) * lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}

export default memo(Node)
