import { useLang } from '../../i18n.jsx'
import styles from './SearchBar.module.css'

export default function SearchBar({ value, onChange }) {
  const { t } = useLang()
  return (
    <div className={styles.wrap}>
      <span className={styles.icon} aria-hidden>⌕</span>
      <input
        className={styles.input}
        type="text"
        placeholder={t('search.placeholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button className={styles.clear} onClick={() => onChange('')} aria-label={t('search.clear')}>
          ✕
        </button>
      )}
    </div>
  )
}
