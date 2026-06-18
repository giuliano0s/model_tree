import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import styles from './Recommender.module.css'

// painel flutuante: descreve a situação -> chama /api/recommend -> mostra resposta
export default function Recommender({ onClose }) {
  const [situacao,  setSituacao]  = useState('')
  const [loading,   setLoading]   = useState(false)
  const [erro,      setErro]      = useState(null)
  const [resultado, setResultado] = useState(null) // { candidatos, recomendacao }

  // envia a situação ao endpoint e trata resposta/erro
  async function enviar() {
    const texto = situacao.trim()
    if (!texto) return
    setLoading(true); setErro(null); setResultado(null)
    try {
      const r = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situacao: texto, topK: 5 }),
      })
      const data = await r.json()
      if (!r.ok) { setErro(data.erro || 'erro na requisição'); return }
      setResultado(data)
    } catch {
      setErro('falha de conexão com o servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>Que modelo usar?</h2>
          <button className={styles.close} onClick={onClose} aria-label="Fechar">×</button>
        </header>

        <textarea
          className={styles.input}
          placeholder="Descreva sua situação: dados, problema, restrições..."
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          rows={4}
        />
        <button
          className={styles.submit}
          onClick={enviar}
          disabled={loading || !situacao.trim()}
        >
          {loading ? 'Consultando...' : 'Recomendar'}
        </button>

        {erro && <p className={styles.erro}>{erro}</p>}

        {resultado && (
          <div className={styles.resultado}>
            <div className={styles.candidatos}>
              {resultado.candidatos.map((c) => (
                <span key={c.id} className={styles.chip} title={`${c.year} · ${c.branch}`}>
                  {c.name}
                </span>
              ))}
            </div>
            <div className={styles.markdown}>
              <ReactMarkdown>{resultado.recomendacao}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
