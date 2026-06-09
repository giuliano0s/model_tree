import { useState, useCallback } from 'react'
import { toHsl } from '../../utils/colorUtils.js'
import { useLang } from '../../i18n.jsx'
import SearchBar from '../SearchBar/index.jsx'
import styles from './NavSidebar.module.css'

/**
 * Navegação lateral: árvore colapsável (estado de colapso PRÓPRIO, independente
 * do canvas). Clicar no nome leva + dá zoom no nó (onNavigate). A setinha
 * expande/colapsa os filhos só na navbar.
 */
export default function NavSidebar({
  rootData,
  colorMap,
  selectedId,
  query,
  onQueryChange,
  searchActive,
  matchIds,
  ancestorIds,
  onNavigate,
  onToggleNav,
}) {
  const { t, lang, setLang, languages } = useLang()
  // ids expandidos na navbar — começa só com a raiz aberta
  const [expanded, setExpanded] = useState(() => new Set(['root']))
  const [langOpen, setLangOpen] = useState(false)

  const toggle = useCallback((id) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  if (!rootData) return null

  return (
    <nav className={styles.nav}>
      <header className={styles.header}>
        <span className={styles.logo}>⊹</span>
        <h1 className={styles.title}>{t('nav.title')}</h1>

        <div className={styles.langWrap}>
          <button
            className={styles.langCurrent}
            onClick={() => setLangOpen(o => !o)}
            title={t('lang.switch')}
            aria-haspopup="listbox"
            aria-expanded={langOpen}
          >
            {lang.toUpperCase()} <span className={styles.caret}>▾</span>
          </button>
          {langOpen && (
            <>
              <div className={styles.backdrop} onClick={() => setLangOpen(false)} />
              <ul className={styles.langMenu} role="listbox">
                {languages.map(({ code, name }) => (
                  <li key={code}>
                    <button
                      className={`${styles.langOption} ${lang === code ? styles.langActive : ''}`}
                      onClick={() => { setLang(code); setLangOpen(false) }}
                      role="option"
                      aria-selected={lang === code}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <button className={styles.collapse} onClick={onToggleNav} title={t('nav.collapse')} aria-label={t('nav.collapse')}>
          «
        </button>
      </header>

      <SearchBar value={query} onChange={onQueryChange} />

      <ul className={styles.tree}>
        <NavItem
          node={rootData}
          depth={0}
          expanded={expanded}
          selectedId={selectedId}
          colorMap={colorMap}
          searchActive={searchActive}
          matchIds={matchIds}
          ancestorIds={ancestorIds}
          onToggle={toggle}
          onNavigate={onNavigate}
        />
      </ul>
    </nav>
  )
}

function NavItem({
  node, depth, expanded, selectedId, colorMap,
  searchActive, matchIds, ancestorIds, onToggle, onNavigate,
}) {
  const { t } = useLang()
  const hasChildren = node.children && node.children.length > 0
  const isMatch = searchActive && matchIds.has(node.id)
  // com busca ativa: força aberto (mostra o caminho até os resultados)
  const isOpen = searchActive ? true : expanded.has(node.id)
  const isSelected = selectedId === node.id
  const color = colorMap?.get(node.id)
  const dot = color ? toHsl(color) : 'var(--color-text-muted)'

  // filtra filhos visíveis quando há busca: só matches e ancestrais de matches
  const visibleChildren = hasChildren
    ? (searchActive
        ? node.children.filter(c => matchIds.has(c.id) || ancestorIds.has(c.id))
        : node.children)
    : []

  return (
    <li>
      <div
        className={`${styles.row} ${isSelected ? styles.selected : ''} ${isMatch ? styles.match : ''}`}
        style={{ paddingLeft: depth * 14 + 8 }}
      >
        {hasChildren && visibleChildren.length > 0 ? (
          <button
            className={styles.arrow}
            onClick={() => onToggle(node.id)}
            aria-label={isOpen ? t('nav.collapseItem') : t('nav.expandItem')}
            disabled={searchActive}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className={styles.spacer} />
        )}

        <span className={styles.dot} style={{ background: dot }} />

        <button className={styles.label} onClick={() => onNavigate(node.id)} title={node.name}>
          {node.name}
        </button>
      </div>

      {isOpen && visibleChildren.length > 0 && (
        <ul className={styles.children}>
          {visibleChildren.map(child => (
            <NavItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              colorMap={colorMap}
              searchActive={searchActive}
              matchIds={matchIds}
              ancestorIds={ancestorIds}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
