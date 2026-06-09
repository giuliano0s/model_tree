import { useLayoutEffect, useRef, useState } from 'react'
import { useLang } from '../../i18n.jsx'
import styles from './DetailPanel.module.css'

const GAP = 16     // distância do nó
const MARGIN = 12  // margem mínima da borda da viewport

/**
 * Painel flutuante com os metadados do nó selecionado.
 * Posiciona-se ao lado do nó, preferindo a direita; cai para a esquerda
 * (ou para o lado com mais espaço) e é clampado para nunca sair da tela.
 */
export default function DetailPanel({ node, anchor, container, closing, onClose, onExited }) {
  const { t } = useLang()
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: 0, top: 0, originX: 0, originY: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const pw = el.offsetWidth
    const ph = el.offsetHeight
    const { w: cw, h: ch } = container

    const rightSpace = cw - anchor.right
    const leftSpace  = anchor.left

    let left, side
    if (rightSpace >= pw + GAP + MARGIN) { left = anchor.right + GAP; side = 'right' }
    else if (leftSpace >= pw + GAP + MARGIN) { left = anchor.left - GAP - pw; side = 'left' }
    else if (rightSpace >= leftSpace) { left = cw - pw - MARGIN; side = 'right' }
    else { left = MARGIN; side = 'left' }

    let top = anchor.cy - ph / 2
    top = Math.max(MARGIN, Math.min(top, ch - ph - MARGIN))

    // origem da transformação = ponto do painel mais próximo do nó
    // (de onde ele é "cuspido" e para onde volta)
    const originX = side === 'right' ? 0 : pw
    const originY = Math.max(0, Math.min(ph, anchor.cy - top))

    setPos({ left, top, originX, originY })
  }, [node, anchor, container])

  const list = (items) => (items ?? []).length > 0

  function handleAnimEnd(e) {
    if (e.target === ref.current && closing) onExited()
  }

  return (
    <div
      ref={ref}
      className={`${styles.panel} ${closing ? styles.exit : styles.enter}`}
      style={{
        left: pos.left,
        top: pos.top,
        transformOrigin: `${pos.originX}px ${pos.originY}px`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onAnimationEnd={handleAnimEnd}
    >
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{node.name}</h2>
          {node.year != null && <span className={styles.year}>{node.year}</span>}
        </div>
        <button className={styles.close} onClick={onClose} aria-label={t('panel.close')}>✕</button>
      </header>

      <div className={styles.body}>
        {node.diff_siblings && (
          <p className={styles.diff}>{node.diff_siblings}</p>
        )}

        {list(node.strengths) && (
          <section className={styles.section}>
            <div className={`${styles.head} ${styles.good}`}>
              <span className={styles.dot}>✓</span> {t('panel.strengths')}
            </div>
            <ul className={styles.ul}>
              {node.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </section>
        )}

        {list(node.weaknesses) && (
          <section className={styles.section}>
            <div className={`${styles.head} ${styles.bad}`}>
              <span className={styles.dot}>✕</span> {t('panel.weaknesses')}
            </div>
            <ul className={styles.ul}>
              {node.weaknesses.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </section>
        )}

        {list(node.recommended_for) && (
          <section className={styles.section}>
            <div className={`${styles.head} ${styles.rec}`}>
              <span className={styles.dot}>→</span> {t('panel.recommended')}
            </div>
            <ul className={styles.ul}>
              {node.recommended_for.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </section>
        )}

        {list(node.not_recommended_for) && (
          <section className={styles.section}>
            <div className={`${styles.head} ${styles.notrec}`}>
              <span className={styles.dot}>⊘</span> {t('panel.notRecommended')}
            </div>
            <ul className={styles.ul}>
              {node.not_recommended_for.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </section>
        )}

        {node.curiosity && (
          <section className={styles.curiosity}>
            <div className={`${styles.head} ${styles.cur}`}>
              <span className={styles.dot}>💡</span> {t('panel.curiosity')}
            </div>
            <p>{node.curiosity}</p>
          </section>
        )}
      </div>
    </div>
  )
}
