import { formatNumber } from '../../../i18n/format'
import { useLanguage } from '../../../i18n/LanguageContext'
import { ROUTE } from '../../../ship/sailing'
import type { ZoneText } from '../../../types/content'
import type { Sailing } from '../../../types/sailing'
import styles from './EtaCard.module.css'

/** Rough width of one 13 px character as a share of the bar (about 370 px at kiosk size). */
const CHAR_W = 0.02
/** Space kept between two labels, as a share of the bar */
const LABEL_GAP = 0.03

const position = (at: number) => (at <= 0 ? '7px' : at >= 1 ? 'calc(100% - 7px)' : `${at * 100}%`)
const edgeClass = (at: number) => (at < 0.08 ? styles.first : at > 0.92 ? styles.last : '')

/** Where a label sits on the bar (0–1), from its alignment: left-aligned at the start, right-aligned at the end. */
function extent(at: number, text: string): [number, number] {
  const w = text.length * CHAR_W
  return at < 0.08 ? [at, at + w] : at > 0.92 ? [at - w, at] : [at - w / 2, at + w / 2]
}

/** A stop label hides when it would touch the label at the ship. */
const clear = (a: [number, number], b: [number, number]) => a[1] + LABEL_GAP <= b[0] || b[1] + LABEL_GAP <= a[0]

/** Arrival time and the progress bar with the route stops (reversed on the return crossing). */
export function EtaCard({ sailing, zone }: { sailing: Sailing; zone: ZoneText }) {
  const { t, lang } = useLanguage()
  const p = sailing.progress
  const stops = ROUTE.stops
    .map((s) => ({ ...s, at: sailing.direction === 1 ? s.at : 1 - s.at }))
    .sort((a, b) => a.at - b.at)
  const here = extent(p, zone.here)

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
        {stops.map((s) => {
          if (!s.label) return null
          const text = t(`waypoint.${s.label}`)
          return (
            clear(extent(s.at, text), here) && (
              <span key={s.label} className={`${styles.lbl} ${edgeClass(s.at)}`} style={{ left: `${s.at * 100}%` }}>
                {text}
              </span>
            )
          )
        })}
        <span className={`${styles.lbl} ${styles.cur} ${edgeClass(p)}`} style={{ left: `${p * 100}%` }}>
          {zone.here}
        </span>
      </div>
    </div>
  )
}
