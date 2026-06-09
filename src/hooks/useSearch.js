import { useState, useMemo, useCallback } from 'react'
import { filterByQuery, getPath } from '../utils/treeUtils.js'

export function useSearch(rootData) {
  const [query, setQuery] = useState('')

  const { matchIds, ancestorIds } = useMemo(() => {
    if (!query.trim() || !rootData) {
      return { matchIds: new Set(), ancestorIds: new Set() }
    }

    const matchIds = filterByQuery(rootData, query)

    // Coleta todos os ancestrais dos nós que casaram para manter contexto visível
    const ancestorIds = new Set()
    for (const id of matchIds) {
      const path = getPath(rootData, id)
      if (path) {
        path.slice(0, -1).forEach(pid => ancestorIds.add(pid))
      }
    }

    return { matchIds, ancestorIds }
  }, [query, rootData])

  const clearSearch = useCallback(() => setQuery(''), [])

  const isActive = query.trim().length > 0

  return { query, setQuery, matchIds, ancestorIds, isActive, clearSearch }
}
