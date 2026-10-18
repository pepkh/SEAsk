import { foulingAlongRoute } from '../../../bridge/derive/fouling'
import { project, type View } from '../../../bridge/map/mercator'
import type { Fouling } from '../../../bridge/model'
import { pointAt, routeBetween } from '../../../ship/sailing'
import styles from './BridgeMap.module.css'

const HATCH = 'bridge-fouling-hatch'
/** From this zoom the model's cells are outlined, so their size (about 3 × 4.6 km) shows. */
const OUTLINE_ZOOM = 11

/**
 * Under the route: water the model has no estimate for (outside its training extent) is hatched, so it
 * never reads as "low", and close in the scored cells are outlined.
 */
export function FoulingCells({ view, fouling }: { view: View; fouling: Fouling }) {
  const { grid: g, cover } = fouling
  const outline = view.zoom >= OUTLINE_ZOOM
  const cells = []
  for (let iy = 0; iy < g.nLat; iy++) {
    for (let ix = 0; ix < g.nLon; ix++) {
      const k = iy * g.nLon + ix
      if (cover[k] === 0 || (cover[k] === 2 && !outline)) continue
      const lat = g.lat0 + iy * g.dLat
      const lon = g.lon0 + ix * g.dLon
      const [x0, y0] = project(view, lat + g.dLat / 2, lon - g.dLon / 2)
      const [x1, y1] = project(view, lat - g.dLat / 2, lon + g.dLon / 2)
      cells.push(
        cover[k] === 1 ? (
          <rect key={k} x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={`url(#${HATCH})`} className={styles.foulingNone} />
        ) : (
          <rect key={k} x={x0} y={y0} width={x1 - x0} height={y1 - y0} className={styles.foulingCell} />
        ),
      )
    }
  }
  return (
    <g>
      <defs>
        <pattern id={HATCH} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={7} className={styles.foulingHatch} />
        </pattern>
      </defs>
      {cells}
    </g>
  )
}

/** Over the route: the stretches at or above the hotspot level, labelled with their id and peak. */
export function FoulingHotspots({ view, fouling }: { view: View; fouling: Fouling }) {
  const { hotspots } = foulingAlongRoute(fouling)
  return (
    <g>
      {hotspots.map((h) => {
        const points = routeBetween(h.from, h.to)
          .map(([lat, lon]) => project(view, lat, lon).join(','))
          .join(' ')
        const [x, y] = project(view, ...pointAt((h.from + h.to) / 2))
        return (
          <g key={h.id}>
            <polyline points={points} className={styles.foulingCasing} />
            <polyline points={points} className={styles.foulingHot} />
            <text x={x + 12} y={y - 8} className={styles.label}>
              {h.id} · {Math.round(h.peak)}
            </text>
          </g>
        )
      })}
    </g>
  )
}
