import { formatCourse, formatLatLon, formatNumber } from '../../i18n/format'
import { useLanguage } from '../../i18n/LanguageContext'
import type { ShipRow } from '../../types/feed'
import styles from './StatTiles.module.css'

/** Speed, course and position. */
export function StatTiles({ row }: { row: ShipRow }) {
  const { t, lang } = useLanguage()
  return (
    <div className={styles.tiles}>
      <div className={styles.tile}>
        <span className={styles.label}>{t('journey.speed')}</span>
        <span className={styles.value}>
          {formatNumber(row.speed_over_ground, 1, lang)}
          <span> {t('journey.kn')}</span>
        </span>
      </div>
      <div className={styles.tile}>
        <span className={styles.label}>{t('journey.course')}</span>
        <span className={styles.value}>
          {formatCourse(row.ship_course)}
          <span> °T</span>
        </span>
      </div>
      <div className={styles.tile}>
        <span className={styles.label}>{t('journey.position')}</span>
        <span className={styles.position}>
          {formatLatLon(row.latitude, 'lat', lang)}
          <br />
          {formatLatLon(row.longitude, 'lon', lang)}
        </span>
      </div>
    </div>
  )
}
