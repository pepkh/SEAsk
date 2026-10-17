import { formatNumber } from '../../../i18n/format'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { ReadingsContent } from '../../../types/content'
import type { ShipRow } from '../../../types/feed'
import type { Sailing } from '../../../types/sailing'
import styles from './ReadingTiles.module.css'

/** The four kid-friendly readings (2 × 2). Without a reading (pump off at the dock) a tile says why. */
export function ReadingTiles({ row, sailing, readings }: { row: ShipRow; sailing: Sailing; readings: ReadingsContent }) {
  const { t, lang } = useLanguage()
  return (
    <div className={styles.tiles}>
      {readings.items.map(
        ({ key, unit, kids }) =>
          kids && (
            <div key={key} className={styles.tile}>
              <span className={styles.k}>{kids.name}</span>
              {row[key] === null ? (
                <span className={styles.none}>{t(sailing.status === 'docked' ? 'journey.sensorsResting' : 'journey.noReading')}</span>
              ) : (
                <>
                  <span className={styles.v}>
                    {formatNumber(row[key], kids.digits, lang)}
                    <small> {unit}</small>
                  </span>
                  <span className={styles.h}>{kids.hint}</span>
                </>
              )}
            </div>
          ),
      )}
    </div>
  )
}
