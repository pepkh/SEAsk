import type { TideCurrent } from '../../../bridge/model'
import type { Axis } from '../../../bridge/series'
import { areaPath, linePath, type Scale } from './path'
import styles from './charts.module.css'

const W = 360
const H = 64

/** The tidal current over the day: flood above the zero line, ebb below, slack where it crosses. */
export function MiniCurrent({ axis, current, dayStart, dayEnd, t }: { axis: Axis; current: TideCurrent; dayStart: number; dayEnd: number; t: number }) {
  let max = 1
  for (const v of current.signedKn) if (Number.isFinite(v)) max = Math.max(max, Math.abs(v))
  const s: Scale = {
    x: (time) => ((time - dayStart) / (dayEnd - dayStart)) * W,
    y: (v) => H / 2 - (v / max) * (H / 2 - 4),
  }
  const flood = current.signedKn.map((v) => (Number.isFinite(v) ? Math.max(0, v) : NaN))
  const ebb = current.signedKn.map((v) => (Number.isFinite(v) ? Math.min(0, v) : NaN))
  const nowX = s.x(t)
  return (
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${current.station} current over the day, flood up, ebb down`}>
      <path d={areaPath(axis, flood, s, 0)} className={styles.flood} />
      <path d={areaPath(axis, ebb, s, 0)} className={styles.ebb} />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className={styles.zero} />
      <path d={linePath(axis, current.signedKn, s, 0, W)} className={styles.line} />
      {current.events
        .filter((e) => e.type === 'slack')
        .map((e) => (
          <line key={e.t} x1={s.x(e.t)} x2={s.x(e.t)} y1={H / 2 - 4} y2={H / 2 + 4} className={styles.slack} />
        ))}
      <line x1={nowX} x2={nowX} y1={0} y2={H} className={styles.now} />
    </svg>
  )
}
