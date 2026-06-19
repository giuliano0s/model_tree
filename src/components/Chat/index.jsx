import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { useLang } from '../../i18n.jsx'
import styles from './Chat.module.css'

// chat multi-turno: envia o histórico a /api/chat e exibe a resposta em streaming
export default function Chat({ onClose }) {
  const { t } = useLang()
  const [messages, setMessages] = useState([]) // { role: 'user' | 'model', text }
  const [input,    setInput]    = useState('')
  const [streaming, setStreaming] = useState(false)
  const scrollRef = useRef(null)

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
        body: JSON.stringify({ messages: historico }),
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
        copy[copy.length - 1] = { role: 'model', text: t('rec.error') }
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
          <button className={styles.close} onClick={onClose} aria-label={t('panel.close')}>×</button>
        </header>

        <div className={styles.messages} ref={scrollRef}>
          {messages.length === 0 && <p className={styles.hint}>{t('chat.placeholder')}</p>}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? styles.user : styles.model}>
              {m.role === 'model'
                ? (m.text
                    ? <ReactMarkdown>{m.text}</ReactMarkdown>
                    : <span className={styles.dots}>{t('chat.thinking')}</span>)
                : m.text}
            </div>
          ))}
        </div>

        <div className={styles.inputRow}>
          <textarea
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
