import { formatNumber } from '../../../i18n/format'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { ReadingsContent } from '../../../types/content'
import type { ShipRow } from '../../../types/feed'
import styles from './ReadingTiles.module.css'

/** The four kid-friendly readings (2 × 2). */
export function ReadingTiles({ row, readings }: { row: ShipRow; readings: ReadingsContent }) {
  const { lang } = useLanguage()
  return (
    <div className={styles.tiles}>
      {readings.items.map(
        ({ key, unit, kids }) =>
          kids && (
            <div key={key} className={styles.tile}>
              <span className={styles.k}>{kids.name}</span>
              <span className={styles.v}>
                {formatNumber(row[key], kids.digits, lang)}
                <small> {unit}</small>
              </span>
              <span className={styles.h}>{kids.hint}</span>
            </div>
          ),
      )}
    </div>
  )
}
