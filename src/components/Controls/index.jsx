import { useLang } from '../../i18n.jsx'
import styles from './Controls.module.css'

export default function Controls({
  saveStatus = 'idle',
  onZoomIn,
  onZoomOut,
  onFit,
  onSaveLayout,
  onResetLayout,
  onHardReset,
}) {
  const { t } = useLang()

  const saveLabel = {
    idle:   t('controls.save'),
    saving: t('controls.saving'),
    saved:  t('controls.saved'),
  }

  function handleHardReset() {
    if (window.confirm(t('controls.hardResetConfirm'))) onHardReset()
  }

  return (
    <div className={styles.wrap}>
      {/* hard reset discreto — volta ao padrão do repo, descartando a config do usuário */}
      <button
        className={styles.hardReset}
        onClick={handleHardReset}
        title={t('controls.hardResetTitle')}
      >
        {t('controls.hardReset')}
      </button>

      <div className={styles.group}>
        <button
          className={styles.btn}
          onClick={onSaveLayout}
          disabled={saveStatus === 'saving'}
          title={t('controls.saveTitle')}
        >
          {saveLabel[saveStatus] ?? saveLabel.idle}
        </button>
        <button className={styles.btnGhost} onClick={onResetLayout} title={t('controls.resetTitle')}>
          {t('controls.reset')}
        </button>
      </div>

      <div className={styles.group}>
        <button className={styles.icon} onClick={onZoomIn} title={t('controls.zoomIn')} aria-label={t('controls.zoomIn')}>+</button>
        <button className={styles.icon} onClick={onZoomOut} title={t('controls.zoomOut')} aria-label={t('controls.zoomOut')}>−</button>
        <button className={styles.icon} onClick={onFit} title={t('controls.fit')} aria-label={t('controls.fit')}>⤢</button>
      </div>
    </div>
  )
}
