import { memo } from 'react'
import { metresPerPixel, project, unproject, type View } from '../../../bridge/map/mercator'
import { windStationsAt } from '../../../bridge/field'
import type { DayData } from '../../../bridge/model'
import { ROUTE } from '../../../ship/sailing'
import styles from './BridgeMap.module.css'
import { FoulingCells, FoulingHotspots } from './FoulingOverlay'

/** ONC observatories near the route (fallback positions until the stations dataset arrives). */
const ONC_SITES = [
  { code: 'SCVIP', label: 'SCVIP 296 m', lat: 49.0401, lon: -123.4255, kind: 'node' },
  { code: 'SEVIP', label: 'SEVIP 165 m', lat: 49.0431, lon: -123.3167, kind: 'node' },
  { code: 'IONA', label: 'Iona wind', lat: 49.2161, lon: -123.2055, kind: 'shore' },
] as const

const TERMINALS = [
  { name: 'Swartz Bay', at: ROUTE.points[0] },
  { name: 'Tsawwassen', at: ROUTE.points[ROUTE.points.length - 1] },
]

/** A round length for the scale bar (nautical miles) that fits in `maxPx`. */
function scaleBar(view: View): { px: number; label: string } {
  const [lat] = unproject(view, view.w / 2, view.h / 2)
  const nmPerPx = metresPerPixel(view, lat) / 1852
  const target = nmPerPx * 140
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20]
  const nm = steps.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), steps[0])
  return { px: nm / nmPerPx, label: `${nm} nm` }
}

/**
 * Route, terminals, observatories, CODAR sites, tide gauges, wind stations, scale bar and north arrow (SVG over
 * the canvases); on the biofouling layer also its no-estimate cells and the hotspots on the route.
 */
export const MapOverlay = memo(function MapOverlay({ view, day, t, showWind, showFouling }: { view: View; day: DayData; t: number; showWind: boolean; showFouling: boolean }) {
  const route = ROUTE.points.map(([lat, lon]) => project(view, lat, lon))
  const scale = scaleBar(view)
  // Gauge labels only when zoomed in: at the whole-route view they sit on the terminal names.
  const detail = view.zoom >= 11.5
  // Zoomed out to the region, every station sits in a few pixels: markers only, terminal names kept.
  const far = view.zoom < 9.5
  const sites = day.stations?.stations.length
    ? day.stations.stations.map((s) => ({
        code: s.code,
        label: s.kind === 'node' ? `${s.code} ${Math.round(s.depthM ?? 0)} m` : `${s.code} wind`,
        lat: s.lat,
        lon: s.lon,
        kind: s.kind,
      }))
    : ONC_SITES

  return (
    <svg className={styles.overlay} width={view.w} height={view.h} aria-hidden="true">
      {showFouling && day.fouling && <FoulingCells view={view} fouling={day.fouling} />}
      <polyline points={route.map((p) => p.join(',')).join(' ')} className={styles.route} />
      {showFouling && day.fouling && <FoulingHotspots view={view} fouling={day.fouling} />}
      {TERMINALS.map(({ name, at }) => {
        const [x, y] = project(view, at[0], at[1])
        return (
          <g key={name} transform={`translate(${x},${y})`}>
            <rect x={-5} y={-5} width={10} height={10} className={styles.terminal} />
            <text x={10} y={4} className={styles.label}>
              {name}
            </text>
          </g>
        )
      })}
      {sites.map((s) => {
        const [x, y] = project(view, s.lat, s.lon)
        return (
          <g key={s.code} transform={`translate(${x},${y})`}>
            {s.kind === 'node' ? (
              <path d="M0 -7 L7 0 L0 7 L-7 0 Z" className={styles.node} />
            ) : (
              <circle r={5} className={styles.node} />
            )}
            {/* SCVIP is just west of SEVIP: put its label on the left so the two never touch. */}
            {!far && (
              <text x={s.code === 'SCVIP' ? -10 : 10} y={4} textAnchor={s.code === 'SCVIP' ? 'end' : 'start'} className={styles.label}>
                {s.label}
              </text>
            )}
          </g>
        )
      })}
      {day.currents?.sites.map((s) => {
        const [x, y] = project(view, s.lat, s.lon)
        return (
          <g key={s.code} transform={`translate(${x},${y})`}>
            <path d="M0 -6 L5 4 L-5 4 Z" className={styles.radar} />
            {!far && (
              <text x={8} y={4} className={styles.labelSmall}>
                {s.code}
              </text>
            )}
          </g>
        )
      })}
      {day.tides?.stations.map((s) => {
        const [x, y] = project(view, s.lat, s.lon)
        return (
          <g key={s.code} transform={`translate(${x},${y})`}>
            <rect x={-4} y={-4} width={8} height={8} className={styles.gauge} />
            {detail && (
              <text x={8} y={-6} className={styles.labelSmall}>
                {s.name} tide
              </text>
            )}
          </g>
        )
      })}
      {day.tides?.current && (() => {
        const [x, y] = project(view, day.tides.current.lat, day.tides.current.lon)
        return (
          <g transform={`translate(${x},${y})`}>
            <circle r={6} className={styles.gauge} />
            {detail && (
              <text x={9} y={14} className={styles.labelSmall}>
                Active Pass current
              </text>
            )}
          </g>
        )
      })()}
      {/* Measured wind (Environment Canada): an arrow downwind, longer when stronger; the speed in knots with the wind layer on. */}
      {windStationsAt(day, t, 0, 0).map(({ station, kn, fromDeg }) => {
        const [x, y] = project(view, station.lat, station.lon)
        if (x < -10 || y < -10 || x > view.w + 10 || y > view.h + 10) return null
        const len = 8 + Math.min(1, kn / 25) * 18
        return (
          <g key={station.id} transform={`translate(${x},${y})`}>
            <circle r={3.5} className={styles.windStation} />
            {kn > 0 && Number.isFinite(fromDeg) && (
              <path d={`M0 0 V${-len} M-3.5 ${-len + 5} L0 ${-len} L3.5 ${-len + 5}`} transform={`rotate(${(fromDeg + 180) % 360})`} className={styles.windArrow} />
            )}
            {showWind && !far && (
              <text x={7} y={12} className={styles.labelSmall}>
                {kn === 0 ? 'calm' : `${Math.round(kn)} kn`}
              </text>
            )}
          </g>
        )
      })}
      <g transform={`translate(${view.w - 40},${56})`}>
        <path d="M0 -18 L7 6 L0 1 L-7 6 Z" className={styles.north} />
        <text y={22} textAnchor="middle" className={styles.label}>
          N
        </text>
      </g>
      <g transform={`translate(20,${view.h - 54})`}>
        <path d={`M0 0 V6 H${scale.px} V0`} className={styles.scale} />
        <text x={0} y={-6} className={styles.labelSmall}>
          {scale.label}
        </text>
      </g>
    </svg>
  )
})
