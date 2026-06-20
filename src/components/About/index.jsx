import { useLang } from '../../i18n.jsx'
import styles from './About.module.css'

// modal com a proposta do projeto e uma nota; a palavra "modelos" da nota revela
// um nó escondido na árvore (easter egg) via onRevealSecret.
export default function About({ onClose, onRevealSecret }) {
  const { t } = useLang()

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('about.title')}</h2>
          <button className={styles.close} onClick={onClose} aria-label={t('panel.close')}>×</button>
        </header>

        <p className={styles.body}>{t('about.body')}</p>

        <p className={styles.note}>
          {t('about.noteBefore')}
          <a className={styles.secret} onClick={onRevealSecret}>{t('about.noteLink')}</a>
          {t('about.noteAfter')}
        </p>
      </div>
    </div>
  )
}
