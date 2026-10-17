import { formatNumber } from '../../../i18n/format'
import { useLanguage } from '../../../i18n/LanguageContext'
import { ROUTE } from '../../../ship/sailing'
import type { ZoneText } from '../../../types/content'
import type { Sailing } from '../../../types/sailing'
import styles from './EtaCard.module.css'

/** Close labels hide so they do not overlap the label at the ship. */
const LABEL_GAP = 0.15

const position = (at: number) => (at <= 0 ? '7px' : at >= 1 ? 'calc(100% - 7px)' : `${at * 100}%`)
const edgeClass = (at: number) => (at < 0.08 ? styles.first : at > 0.92 ? styles.last : '')

/** Arrival time and the progress bar with the route stops (reversed on the return crossing). */
export function EtaCard({ sailing, zone }: { sailing: Sailing; zone: ZoneText }) {
  const { t, lang } = useLanguage()
  const p = sailing.progress
  const stops = ROUTE.stops
    .map((s) => ({ ...s, at: sailing.direction === 1 ? s.at : 1 - s.at }))
    .sort((a, b) => a.at - b.at)

  return (
    <div className={styles.eta}>
      <div className={styles.row}>
        <b>
          {sailing.etaMin === null
            ? t('journey.next', { place: sailing.to.name })
            : t('journey.eta', { place: sailing.to.name, min: sailing.etaMin })}
        </b>
        {sailing.etaMin !== null && <span>{t('journey.toGo', { km: formatNumber(sailing.remainingKm, 1, lang) })}</span>}
      </div>
      <div className={styles.prog}>
        <div className={styles.track} />
        <div className={styles.fill} style={{ width: `${p * 100}%` }} />
        {stops.map((s) => (
          <span key={s.at} className={`${styles.dot} ${s.at <= p ? styles.on : ''}`} style={{ left: position(s.at) }} />
        ))}
        <span className={styles.me} style={{ left: `${p * 100}%` }} />
        {stops.map(
          (s) =>
            s.label &&
            Math.abs(s.at - p) >= LABEL_GAP && (
              <span key={s.label} className={`${styles.lbl} ${edgeClass(s.at)}`} style={{ left: `${s.at * 100}%` }}>
                {t(`waypoint.${s.label}`)}
              </span>
            ),
        )}
        <span className={`${styles.lbl} ${styles.cur} ${edgeClass(p)}`} style={{ left: `${p * 100}%` }}>
          {zone.here}
        </span>
      </div>
    </div>
  )
}
