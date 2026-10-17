import { formatNumber, formatTime } from '../../i18n/format'
import { useLanguage } from '../../i18n/LanguageContext'
import type { Sailing } from '../../types/sailing'
import styles from './ArrivalCard.module.css'

/** Arrival time, distance done and a thin progress bar. */
export function ArrivalCard({ sailing }: { sailing: Sailing }) {
  const { t, lang } = useLanguage()
  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <b>
          {sailing.arrivalAt
            ? t('journey.arrive', { place: sailing.to.name, time: formatTime(sailing.arrivalAt, lang) })
            : t('journey.next', { place: sailing.to.name })}
        </b>
        <span>
          {formatNumber(sailing.doneKm, 1, lang)} / {formatNumber(sailing.totalKm, 1, lang)} km
        </span>
      </div>
      <div className={styles.bar}>
        <div className={styles.track} />
        <div className={styles.fill} style={{ width: `${sailing.progress * 100}%` }} />
      </div>
    </div>
  )
}
