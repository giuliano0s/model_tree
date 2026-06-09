import { useRef, useEffect, useCallback, useState } from 'react'
import * as d3 from 'd3'

const ZOOM_MIN = 0.03  // permite afastar bastante (árvore inteira com 365 nós)
const ZOOM_MAX = 3
const INITIAL_SCALE = 0.9

export function useZoom(svgRef, groupRef) {
  const zoomBehavior = useRef(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: INITIAL_SCALE })

  useEffect(() => {
    if (!svgRef.current || !groupRef.current) return

    const zoom = d3.zoom()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .filter(event => {
        // Ignora drag iniciado sobre nós (rect, circle com cursor pointer)
        // Permite scroll do mouse em qualquer lugar
        if (event.type === 'wheel') return true
        return event.target.tagName === 'svg' || event.target.tagName === 'g'
      })
      .on('zoom', (event) => {
        const { x, y, k } = event.transform
        groupRef.current.setAttribute(
          'transform',
          `translate(${x},${y}) scale(${k})`
        )
        setTransform({ x, y, k })
      })

    d3.select(svgRef.current).call(zoom)
    zoomBehavior.current = zoom

    return () => {
      d3.select(svgRef.current).on('.zoom', null)
    }
  }, [svgRef, groupRef])

  const centerOn = useCallback((x, y, scale, svgWidth, svgHeight) => {
    if (!svgRef.current || !zoomBehavior.current) return
    const tx = svgWidth  / 2 - x * scale
    const ty = svgHeight / 2 - y * scale
    d3.select(svgRef.current)
      .transition()
      .duration(500)
      .call(
        zoomBehavior.current.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      )
  }, [svgRef])

  const reset = useCallback((svgWidth, svgHeight, treeWidth, treeHeight) => {
    if (!svgRef.current || !zoomBehavior.current) return
    const scale = Math.min(
      svgWidth  / treeWidth,
      svgHeight / treeHeight,
      INITIAL_SCALE
    )
    const tx = (svgWidth  - treeWidth  * scale) / 2
    const ty = (svgHeight - treeHeight * scale) / 2
    d3.select(svgRef.current)
      .transition()
      .duration(400)
      .call(
        zoomBehavior.current.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      )
  }, [svgRef])

  const zoomIn  = useCallback(() => {
    if (!svgRef.current || !zoomBehavior.current) return
    d3.select(svgRef.current)
      .transition().duration(250)
      .call(zoomBehavior.current.scaleBy, 1.35)
  }, [svgRef])

  const zoomOut = useCallback(() => {
    if (!svgRef.current || !zoomBehavior.current) return
    d3.select(svgRef.current)
      .transition().duration(250)
      .call(zoomBehavior.current.scaleBy, 1 / 1.35)
  }, [svgRef])

  return { transform, centerOn, reset, zoomIn, zoomOut }
}
