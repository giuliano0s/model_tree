import { useState, useRef, useEffect, useMemo, Children } from 'react'
import ReactMarkdown from 'react-markdown'
import { useLang } from '../../i18n.jsx'
import { flattenTree } from '../../utils/treeUtils.js'
import styles from './Chat.module.css'

const LEVELS = ['beginner', 'intermediate', 'advanced']
const LEVEL_KEY = 'modeltree.chatLevel'

// chat multi-turno: envia o histórico a /api/chat e exibe a resposta em streaming.
// messages/setMessages vivem no App para a conversa sobreviver a fechar/reabrir o painel.
export default function Chat({ onClose, rootData, onNavigate, messages, setMessages }) {
  const { t } = useLang()
  const [input,    setInput]    = useState('')
  const [streaming, setStreaming] = useState(false)
  const [level, setLevel] = useState(() => localStorage.getItem(LEVEL_KEY) || 'intermediate')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // persiste o nível escolhido
  useEffect(() => { localStorage.setItem(LEVEL_KEY, level) }, [level])

  // foca o textarea ao abrir
  useEffect(() => { inputRef.current?.focus() }, [])

  // índice nome -> id (sem prefixo de numeração nem parêntese) para linkar modelos citados.
  // siglas (ALL-CAPS) casam case-sensitive para não confundir com palavras comuns
  // ("SEM" vs "sem", "MA" vs "má"); nomes normais casam case-insensitive.
  const nameIndex = useMemo(() => {
    if (!rootData) return { ci: null, cs: null, map: new Map() }
    const map = new Map()
    const ciNames = []  // case-insensitive (ex.: Random Forest, XGBoost)
    const csNames = []  // case-sensitive   (ex.: SEM, AR, GAN, T5)
    const isAcronym = (s) => /^[A-Z0-9][A-Z0-9./-]*$/.test(s) || s.length <= 4
    for (const n of flattenTree(rootData)) {
      const nm = n.name.replace(/^\d+(\.\d+)*\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim()
      if (nm.length < 3) continue
      const key = nm.toLowerCase()
      if (map.has(key)) continue
      map.set(key, n.id)
      ;(isAcronym(nm) ? csNames : ciNames).push(nm)
    }
    const build = (names, flags) => {
      if (!names.length) return null
      names.sort((a, b) => b.length - a.length) // casa o nome mais longo primeiro
      const escaped = names.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      return new RegExp(`\\b(${escaped.join('|')})\\b`, flags)
    }
    return { ci: build(ciNames, 'gi'), cs: build(csNames, 'g'), map }
  }, [rootData])

  // troca nomes de modelos conhecidos por links que focam o nó e fecham o chat
  function linkify(children) {
    const { ci, cs, map } = nameIndex
    if (!ci && !cs) return children
    return Children.map(children, (child) => {
      if (typeof child !== 'string') return child
      // coleta todos os matches (das duas regex) e ordena por posição
      const hits = []
      for (const re of [ci, cs]) {
        if (!re) continue
        for (const m of child.matchAll(re)) hits.push({ i: m.index, text: m[0] })
      }
      if (!hits.length) return child
      hits.sort((a, b) => a.i - b.i)
      const parts = []
      let last = 0
      for (const h of hits) {
        if (h.i < last) continue // ignora sobreposição
        const id = map.get(h.text.toLowerCase())
        if (h.i > last) parts.push(child.slice(last, h.i))
        parts.push(
          id
            ? <a key={h.i} className={styles.modelLink}
                 onClick={() => { onNavigate?.(id); onClose() }}>{h.text}</a>
            : h.text,
        )
        last = h.i + h.text.length
      }
      if (last < child.length) parts.push(child.slice(last))
      return parts.length ? parts : child
    })
  }

  const md = {
    p: ({ children }) => <p>{linkify(children)}</p>,
    li: ({ children }) => <li>{linkify(children)}</li>,
    strong: ({ children }) => <strong>{linkify(children)}</strong>,
    em: ({ children }) => <em>{linkify(children)}</em>,
    h1: ({ children }) => <h1>{linkify(children)}</h1>,
    h2: ({ children }) => <h2>{linkify(children)}</h2>,
    h3: ({ children }) => <h3>{linkify(children)}</h3>,
  }

  // mantém a conversa rolada para a última mensagem
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  async function send() {
    const texto = input.trim()
    if (!texto || streaming) return

    const historico = [...messages, { role: 'user', text: texto }]
    setMessages([...historico, { role: 'model', text: '' }])
    setInput('')
    setStreaming(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historico, level }),
      })
      if (!res.ok || !res.body) throw new Error('falha')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setMessages((prev) => {
          const copy = prev.slice()
          copy[copy.length - 1] = { role: 'model', text: acc }
          return copy
        })
      }
    } catch {
      setMessages((prev) => {
        const copy = prev.slice()
        copy[copy.length - 1] = { role: 'model', text: t('chat.error') }
        return copy
      })
    } finally {
      setStreaming(false)
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('chat.title')}</h2>
          <div className={styles.levels} role="group" title={t('chat.level.title')}>
            {LEVELS.map((lv) => (
              <button
                key={lv}
                className={`${styles.levelBtn} ${level === lv ? styles.levelActive : ''}`}
                onClick={() => setLevel(lv)}
              >
                {t(`chat.level.${lv}`)}
              </button>
            ))}
          </div>
          {messages.length > 0 && !streaming && (
            <button className={styles.reset} onClick={() => setMessages([])}>
              {t('chat.reset')}
            </button>
          )}
          <button className={styles.close} onClick={onClose} aria-label={t('panel.close')}>×</button>
        </header>

        <div className={styles.messages} ref={scrollRef}>
          {messages.length === 0 && <p className={styles.hint}>{t('chat.placeholder')}</p>}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? styles.user : styles.model}>
              {m.role === 'model'
                ? (m.text
                    ? <ReactMarkdown components={md}>{m.text}</ReactMarkdown>
                    : <span className={styles.dots}>{t('chat.thinking')}</span>)
                : m.text}
            </div>
          ))}
        </div>

        <div className={styles.inputRow}>
          <textarea
            ref={inputRef}
            className={styles.input}
            placeholder={t('chat.placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={2}
          />
          <button className={styles.send} onClick={send} disabled={streaming || !input.trim()}>
            {t('chat.send')}
          </button>
        </div>
      </div>
    </div>
  )
}
