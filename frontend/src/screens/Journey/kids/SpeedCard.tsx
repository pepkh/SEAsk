import { formatNumber } from '../../../i18n/format'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { Comfort } from '../../../ship/comfort'
import type { ShipRow } from '../../../types/feed'
import type { Sailing } from '../../../types/sailing'
import styles from './SpeedCard.module.css'

/** How far the little boat in the comfort chip leans. */
const TILT_DEG: Record<Comfort, number> = { calm: 0, gentle: 8, rolly: 18 }

/** Big speed number with a kid-friendly comparison, and how much the ship rolls while it sails. */
export function SpeedCard({ row, sailing, comfort }: { row: ShipRow; sailing: Sailing; comfort: Comfort | null }) {
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
        {sailing.status === 'sailing' && comfort && (
          <span className={styles.comfort}>
            <svg viewBox="-12 -9 24 18" width="22" height="16" aria-hidden="true">
              <g transform={`rotate(${TILT_DEG[comfort]})`}>
                <path d="M-10 1 L10 1 L7 6 L-7 6 Z" fill="currentColor" />
                <rect x="-5" y="-4" width="9" height="5" rx="1.5" fill="currentColor" />
              </g>
            </svg>
            {t(`journey.comfort.${comfort}`)}
          </span>
        )}
      </div>
    </div>
  )
}
