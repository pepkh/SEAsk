import type { TideStation } from '../../../bridge/model'
import type { Axis } from '../../../bridge/series'
import { areaPath, linePath, type Scale } from './path'
import styles from './charts.module.css'

const W = 360
const H = 48

/**
 * One tide station's day as a small multiple. All stations share `domain`, so their ranges compare;
 * the now line and dot mark the playhead.
 */
export function MiniTide({ axis, station, domain, dayStart, dayEnd, t }: { axis: Axis; station: TideStation; domain: [number, number]; dayStart: number; dayEnd: number; t: number }) {
  const s: Scale = {
    x: (time) => ((time - dayStart) / (dayEnd - dayStart)) * W,
    y: (v) => H - 4 - ((v - domain[0]) / (domain[1] - domain[0])) * (H - 8),
  }
  const nowX = s.x(t)
  const i = Math.round((t - axis.t0) / axis.stepMs)
  const h = i >= 0 && i < axis.n ? station.h[i] : NaN
  return (
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${station.name} tide over the day`}>
      <path d={areaPath(axis, station.h, s, domain[0])} className={styles.wash} />
      <path d={linePath(axis, station.h, s, 0, W)} className={styles.line} />
      {station.extremes.map((e) => (
        <circle key={e.t} cx={s.x(e.t)} cy={s.y(e.h)} r={2} className={styles.extreme} />
      ))}
      <line x1={nowX} x2={nowX} y1={0} y2={H} className={styles.now} />
      {Number.isFinite(h) && <circle cx={nowX} cy={s.y(h)} r={3.5} className={styles.nowDot} />}
    </svg>
  )
}
