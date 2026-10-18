import { SourceLine } from '../../../components/SourceLine/SourceLine'
import { compassPoint } from '../../../i18n/format'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { TideView } from '../../../tides/useTides'
import styles from './TidesCards.module.css'

/** Dark card: tidal current (DFO prediction) with a compass arrow. `recorded`: the recorded day's prediction. */
export function CurrentCard({ place, current, recorded }: { place: string; current: NonNullable<TideView['current']>; recorded: boolean }) {
  const { t } = useLanguage()
  return (
    <div className={`${styles.card} ${styles.dark}`}>
      <svg viewBox="0 0 120 120" className={styles.compass} role="img" aria-label={t('tides.currentLabel', { dir: compassPoint(current.bearingDeg, t('compass')) })}>
        <circle cx="60" cy="60" r="54" fill="none" stroke="#3A464D" strokeWidth="2" />
        <text x="60" y="18" textAnchor="middle" fontFamily="Outfit, sans-serif" fontSize="12" fill="#A9B4B9">{t('tides.north')}</text>
        <g transform={`rotate(${current.bearingDeg - 90} 60 60)`}>
          <path d="M22 60 L84 60" stroke="#8FC0FF" strokeWidth="8" strokeLinecap="round" />
          <path d="M78 44 L100 60 L78 76 Z" fill="#8FC0FF" />
        </g>
      </svg>
      <div className={styles.text}>
        <span className={styles.eyebrow}>{t('tides.currentIn', { place })}</span>
        <span className={styles.title}>{current.title}</span>
        <span className={styles.body}>
          {current.text} {current.topSpeedKn !== null && t('tides.topSpeed', { n: current.topSpeedKn })}
        </span>
        <SourceLine ids={['dfo']} recorded={recorded} className={styles.source} />
      </div>
    </div>
  )
}
