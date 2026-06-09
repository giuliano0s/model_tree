import { useRef, memo } from 'react'
import { toHsl } from '../../utils/colorUtils.js'
import { linkWidth } from '../../utils/nodeSize.js'

const HIT_WIDTH = 18  // faixa invisível larga para facilitar o "pegar" o galho

// Curva cubic radial-aware: os pontos de controle ficam ao longo da linha
// pai→filho (a 1/3 e 2/3 do caminho), então o galho aponta direto do pai para
// o filho em QUALQUER direção. Por padrão (ox=oy=0) é uma reta suave; o par
// (ox, oy) curva o galho na direção arrastada, nos 2 eixos.
function smoothPath(sx, sy, tx, ty, ox, oy) {
  const c1x = sx + (tx - sx) / 3 + ox
  const c1y = sy + (ty - sy) / 3 + oy
  const c2x = tx - (tx - sx) / 3 + ox
  const c2y = ty - (ty - sy) / 3 + oy
  return `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`
}

function Link({
  id,
  sx, sy, tx, ty,
  ox = 0, oy = 0,
  color,
  depth = 0,
  scaleRef,
  onLinkDrag,
}) {
  const stroke = color ? toHsl(color, 0.8) : 'rgba(255,255,255,0.4)'
  const d = smoothPath(sx, sy, tx, ty, ox, oy)
  const drag = useRef(null)

  function handlePointerDown(e) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY }
  }

  function handlePointerMove(e) {
    if (!drag.current) return
    const k = scaleRef.current || 1
    const ddx = (e.clientX - drag.current.x) / k
    const ddy = (e.clientY - drag.current.y) / k
    drag.current = { x: e.clientX, y: e.clientY }
    onLinkDrag(id, ddx, ddy)
  }

  function handlePointerUp(e) {
    drag.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  return (
    <g>
      {/* curva visível */}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={linkWidth(depth)}
        strokeLinecap="round"
      />
      {/* faixa de hit invisível — arraste para moldar a curva */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={HIT_WIDTH}
        cursor="grab"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </g>
  )
}

export default memo(Link)
