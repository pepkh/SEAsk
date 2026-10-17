import { formatNumber } from '../../../i18n/format'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { ShipRow } from '../../../types/feed'
import type { Sailing } from '../../../types/sailing'
import styles from './SpeedCard.module.css'

/** Big speed number with a kid-friendly comparison. */
export function SpeedCard({ row, sailing }: { row: ShipRow; sailing: Sailing }) {
  const { t, lang } = useLanguage()
  const kmh = Math.round(row.speed_over_ground * 1.852)
  const band = kmh < 25 ? 'slow' : kmh < 50 ? 'medium' : 'fast'
  const hint = sailing.status === 'docked'
    ? t('journey.speedDocked')
    : t('journey.speedHint', { kmh, comparison: t(`journey.comparison.${band}`) })

  return (
    <div className={styles.speed}>
      <span className={styles.n}>{formatNumber(row.speed_over_ground, 1, lang)}</span>
      <div className={styles.u}>
        <b>{t('journey.knots')}</b>
        <span>{hint}</span>
      </div>
    </div>
  )
}
