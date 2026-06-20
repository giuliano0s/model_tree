import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearch } from './hooks/useSearch.js'
import { useLang } from './i18n.jsx'
import { buildColorMap } from './utils/colorUtils.js'
import { findById } from './utils/treeUtils.js'
import Tree from './components/Tree/index.jsx'
import NavSidebar from './components/NavSidebar/index.jsx'
import Chat from './components/Chat/index.jsx'
import styles from './App.module.css'

const LS_KEY = 'modeltree.layout'

const mapToObj = (m) => Object.fromEntries(m)
const objToMap = (o) => new Map(Object.entries(o ?? {}))

export default function App() {
  const [treeData,     setTreeData]     = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [offsets,      setOffsets]      = useState(() => new Map()) // nós:  id → {dx,dy}
  const [linkOffsets,  setLinkOffsets]  = useState(() => new Map()) // links: id → {ox,oy}
  const [saveStatus,   setSaveStatus]   = useState('idle')
  const [focusReq,     setFocusReq]     = useState(null)            // pedido de foco em um nó
  const [navOpen,      setNavOpen]      = useState(true)            // bandeja de navegação aberta?
  const [panelClosing, setPanelClosing] = useState(false)          // painel em animação de saída?
  const [recOpen,      setRecOpen]      = useState(false)          // painel de recomendação aberto?
  const [chatMessages, setChatMessages] = useState([])             // histórico do chat (sobrevive a fechar/reabrir)

  const { t, lang } = useLang()

  // título da aba acompanha o idioma
  useEffect(() => { document.title = t('nav.title') }, [t])

  const colorMap = useMemo(() => (treeData ? buildColorMap(treeData) : new Map()), [treeData])

  const offsetsReady = useRef(false)
  // snapshot do layout salvo pelo usuário — alvo do "Resetar" (soft)
  const defaultLayout = useRef({ nodes: new Map(), links: new Map() })
  // padrão do repo (layout.json) — alvo do "Hard reset"
  const repoDefault   = useRef({ nodes: new Map(), links: new Map() })

  // serialização combinada { nodes, links }
  const serialize = () => JSON.stringify(
    { nodes: mapToObj(offsets), links: mapToObj(linkOffsets) },
    null,
    2,
  )

  // objeto salvo → { nodes: Map, links: Map } (aceita formato antigo plano)
  const toLayoutMaps = (obj) => {
    let nodes = new Map()
    let links = new Map()
    if (obj) {
      if (obj.nodes || obj.links) { nodes = objToMap(obj.nodes); links = objToMap(obj.links) }
      else nodes = objToMap(obj)
    }
    return { nodes, links }
  }

  const applyMaps = (m) => {
    setOffsets(new Map(m.nodes))
    setLinkOffsets(new Map(m.links))
    defaultLayout.current = { nodes: new Map(m.nodes), links: new Map(m.links) }
  }

  // Carrega a árvore do idioma ativo: models_tree.<lang>.json, com fallback para
  // o master (PT). Recarrega ao trocar de idioma; os offsets (layout) são por id,
  // então continuam válidos.
  useEffect(() => {
    let cancelled = false
    // tenta o arquivo do idioma e cai no master PT (models_tree.pt.json)
    const candidates = [...new Set([`/models_tree.${lang}.json`, '/models_tree.pt.json'])]

    async function load() {
      setLoading(true)
      for (const url of candidates) {
        try {
          const r = await fetch(url)
          if (!r.ok) continue
          const data = await r.json()
          if (cancelled) return
          setTreeData(data)
          setSelectedNode(null)   // evita painel com conteúdo do idioma anterior
          setLoading(false)
          return
        } catch { /* tenta o próximo candidato */ }
      }
      if (!cancelled) { setError('failed to load tree data'); setLoading(false) }
    }

    load()
    return () => { cancelled = true }
  }, [lang])

  // Carrega layout: aplica o do usuário (localStorage) se existir; sempre guarda
  // o padrão do repo (layout.json) para o Hard reset.
  useEffect(() => {
    const wip = localStorage.getItem(LS_KEY)
    let appliedFromUser = false
    if (wip) {
      try { applyMaps(toLayoutMaps(JSON.parse(wip))); appliedFromUser = true } catch { /* ignore */ }
    }
    fetch('/layout.json')
      .then(r => (r.ok ? r.json() : null))
      .then(obj => {
        repoDefault.current = toLayoutMaps(obj)
        if (!appliedFromUser) applyMaps(repoDefault.current)
      })
      .catch(() => { /* sem arquivo de layout */ })
      .finally(() => { offsetsReady.current = true })
  }, [])

  // Autosave do rascunho enquanto arruma
  useEffect(() => {
    if (!offsetsReady.current) return
    if (offsets.size === 0 && linkOffsets.size === 0) localStorage.removeItem(LS_KEY)
    else localStorage.setItem(LS_KEY, serialize())
  }, [offsets, linkOffsets])

  const handleDrag = useCallback((id, ddx, ddy) => {
    setOffsets(prev => {
      const next = new Map(prev)
      const cur = next.get(id) ?? { dx: 0, dy: 0 }
      next.set(id, { dx: cur.dx + ddx, dy: cur.dy + ddy })
      return next
    })
  }, [])

  const handleLinkDrag = useCallback((id, ddx, ddy) => {
    setLinkOffsets(prev => {
      const next = new Map(prev)
      const cur = next.get(id) ?? { ox: 0, oy: 0 }
      next.set(id, { ox: cur.ox + ddx, oy: cur.oy + ddy })
      return next
    })
  }, [])

  // Salvar: persiste a config DO USUÁRIO no localStorage (funciona em produção,
  // sem backend). Em dev, também grava data/layout.json (atualiza o padrão do repo).
  const handleSaveLayout = useCallback(async () => {
    const json = serialize()
    setSaveStatus('saving')
    const snapshot = { nodes: new Map(offsets), links: new Map(linkOffsets) }

    try { localStorage.setItem(LS_KEY, json) } catch { /* quota cheia */ }
    defaultLayout.current = snapshot   // vira o alvo do Resetar (soft)

    // em dev o endpoint existe e grava o arquivo do repo; em produção, falha silenciosa
    try {
      const r = await fetch('/__save-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
      })
      if (r.ok) repoDefault.current = snapshot
    } catch { /* sem endpoint (produção) — ok, já salvou no localStorage */ }

    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 1500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offsets, linkOffsets])

  // Resetar (soft): volta para a última config salva pelo usuário
  const handleResetLayout = useCallback(() => {
    const d = defaultLayout.current
    setOffsets(new Map(d.nodes))
    setLinkOffsets(new Map(d.links))
  }, [])

  // Hard reset: descarta a config do usuário e volta ao padrão do repo (o "meu")
  const handleHardReset = useCallback(() => {
    const repo = repoDefault.current
    setOffsets(new Map(repo.nodes))
    setLinkOffsets(new Map(repo.links))
    defaultLayout.current = { nodes: new Map(repo.nodes), links: new Map(repo.links) }
    localStorage.removeItem(LS_KEY)
  }, [])

  // Seleciona um nó (abre/troca o painel) — cancela qualquer fechamento em curso
  const selectNode = useCallback((data) => {
    setSelectedNode(data)
    setPanelClosing(false)
  }, [])

  // Pede o fechamento (dispara a animação de saída; o desmonte vem no onExited)
  const requestCloseDetail = useCallback(() => setPanelClosing(true), [])

  // Clique no nó do canvas: alterna — clicar de novo no mesmo nó fecha
  const handleNodeClick = useCallback((data) => {
    if (selectedNode && selectedNode.id === data.id && !panelClosing) {
      setPanelClosing(true)
      return
    }
    setSelectedNode(data)
    setPanelClosing(false)
  }, [selectedNode, panelClosing])

  // Chamado quando a animação de saída termina → desmonta o painel
  const handlePanelExited = useCallback(() => {
    setSelectedNode(null)
    setPanelClosing(false)
  }, [])

  // Esc fecha o painel
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && selectedNode && !panelClosing) setPanelClosing(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNode, panelClosing])

  // Clicar na navbar: foca + dá zoom no nó e abre o painel de info
  const handleNavigate = useCallback((id) => {
    setFocusReq({ id, nonce: Date.now() })
    const found = findById(treeData, id)
    if (found) selectNode(found)
  }, [treeData, selectNode])

  const { query, setQuery, matchIds, ancestorIds, isActive } = useSearch(treeData)

  if (loading) return <div className={styles.status}>{t('app.loading')}</div>
  if (error)   return <div className={styles.status}>{t('app.error')}: {error}</div>

  return (
    <div className={styles.layout}>
      <aside className={`${styles.nav} ${navOpen ? '' : styles.navClosed}`}>
        <NavSidebar
          rootData={treeData}
          colorMap={colorMap}
          selectedId={selectedNode?.id}
          query={query}
          onQueryChange={setQuery}
          searchActive={isActive}
          matchIds={matchIds}
          ancestorIds={ancestorIds}
          onNavigate={handleNavigate}
          onToggleNav={() => setNavOpen(false)}
        />
      </aside>

      {/* Canvas principal */}
      <main className={styles.canvas}>
        {!navOpen && (
          <button
            className={styles.navOpenBtn}
            onClick={() => setNavOpen(true)}
            title="Abrir navegação"
            aria-label="Abrir navegação"
          >
            »
          </button>
        )}
        <Tree
          rootData={treeData}
          colorMap={colorMap}
          selectedNode={selectedNode}
          searchActive={isActive}
          matchIds={matchIds}
          ancestorIds={ancestorIds}
          offsets={offsets}
          linkOffsets={linkOffsets}
          saveStatus={saveStatus}
          focusReq={focusReq}
          panelClosing={panelClosing}
          onNodeClick={handleNodeClick}
          onDrag={handleDrag}
          onLinkDrag={handleLinkDrag}
          onSaveLayout={handleSaveLayout}
          onResetLayout={handleResetLayout}
          onHardReset={handleHardReset}
          onCloseDetail={requestCloseDetail}
          onPanelExited={handlePanelExited}
        />
      </main>

      {/* botão flutuante + painel de recomendação por LLM */}
      <button
        className={styles.recBtn}
        onClick={() => setRecOpen(true)}
        title={t('chat.title')}
      >
        ✨ {t('chat.open')}
      </button>
      {recOpen && (
        <Chat
          onClose={() => setRecOpen(false)}
          rootData={treeData}
          onNavigate={handleNavigate}
          messages={chatMessages}
          setMessages={setChatMessages}
        />
      )}
    </div>
  )
}
