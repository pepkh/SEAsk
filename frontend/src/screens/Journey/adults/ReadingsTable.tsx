import { FEED_POLL_MS } from '../../../config/env'
import { formatNumber } from '../../../i18n/format'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { ReadingsContent } from '../../../types/content'
import type { ShipRow } from '../../../types/feed'
import styles from './ReadingsTable.module.css'
import { Sparkline } from './Sparkline'

const LAST_15_MIN_ROWS = (15 * 60 * 1000) / FEED_POLL_MS

/** Nine sensor readings: value now, the last 15 minutes and the QC pass rate. */
export function ReadingsTable({ row, history, readings }: { row: ShipRow; history: ShipRow[]; readings: ReadingsContent }) {
  const { t, lang } = useLanguage()
  const recent = history.slice(-LAST_15_MIN_ROWS)

  return (
    <div className={styles.table}>
      <div className={`${styles.grid} ${styles.head}`}>
        <span>{t('journey.table.reading')}</span>
        <span className={styles.right}>{t('journey.table.now')}</span>
        <span>{t('journey.table.last15')}</span>
        <span className={styles.right}>{t('journey.table.qc')}</span>
      </div>
      {readings.items.map(({ key, name, unit, digits, qc }) => (
        <div key={key} className={`${styles.grid} ${styles.row}`}>
          <span className={styles.name}>{name}</span>
          <span className={styles.value}>
            {formatNumber(row[key], digits, lang)}
            <span> {unit}</span>
          </span>
          <Sparkline values={recent.map((r) => r[key])} />
          <span className={styles.qc}>{qc}%</span>
        </div>
      ))}
    </div>
  )
}
