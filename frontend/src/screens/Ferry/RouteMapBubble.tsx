import type { MouseEvent, PointerEvent } from 'react'
import { Bubble } from '../../components/Bubble/Bubble'
import { ISLAND_PATHS, SWARTZ_BAY_PT, svgRoute, TSAWWASSEN_PT } from '../../components/RouteMap/geometry'
import { useLanguage } from '../../i18n/LanguageContext'
import type { Sailing } from '../../types/sailing'
import styles from './RouteMapBubble.module.css'
import { MAP_VIEW } from './routeMapView'

interface Props {
  sailing: Sailing
  place: string
  /** Where the rewound view is (route fraction), drawn as a ghost ship; null when live */
  ghost?: number | null
  /** Where the recorded part of this crossing starts (route fraction) when the start was never recorded */
  recordedFrom?: number | null
  onPress?: (e: MouseEvent<HTMLButtonElement>) => void
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void
  onPointerMove?: (e: PointerEvent<HTMLButtonElement>) => void
  onPointerUp?: (e: PointerEvent<HTMLButtonElement>) => void
}

/** The route in a round "porthole": islands, the part sailed (solid), the part ahead (dashed) and the live ship. */
export function RouteMapBubble({ sailing, place, ghost = null, recordedFrom = null, onPress, onPointerDown, onPointerMove, onPointerUp }: Props) {
  const { t } = useLanguage()
  const route = svgRoute(sailing.fraction, sailing.direction)
  const [x, y] = route.ship
  const ghostPt = ghost === null ? null : svgRoute(ghost, sailing.direction).ship
  // The part sailed before the history starts can't be rewound to: drawn faded.
  const unrecorded = recordedFrom === null ? null : svgRoute(recordedFrom, sailing.direction).travelled
  const { x: vx, y: vy, size } = MAP_VIEW

  return (
    <Bubble
      size={400}
      bob={1.2}
      orbClassName={styles.orb}
      caption={t('bubbles.routeMap')}
      aria-label={t('bubbles.routeMapLabel', { place })}
      data-tour="route-map"
      onClick={onPress}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg viewBox={`${vx} ${vy} ${size} ${size}`} className={styles.map} aria-hidden="true">
        <rect x={vx} y={vy} width={size} height={size} fill="#CBDDE6" />
        <g fill="#F5F7F7" stroke="#AEB9BE" strokeWidth="3">
          {ISLAND_PATHS.map((d) => <path key={d} d={d} />)}
        </g>
        <path d={route.remaining} fill="none" stroke="#5E7480" strokeWidth="9" strokeDasharray="3 20" strokeLinecap="round" />
        <path d={route.travelled} fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
        {unrecorded && <path d={unrecorded} fill="none" stroke="#c3ccd0" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />}
        {[SWARTZ_BAY_PT, TSAWWASSEN_PT].map(([px, py]) => (
          <circle key={px} cx={px} cy={py} r="13" fill="#fff" stroke="#5E7480" strokeWidth="5" />
        ))}
        {ghostPt && (
          <g className={styles.ghost}>
            <circle cx={ghostPt[0]} cy={ghostPt[1]} r="38" fill="#e5372a" opacity=".2" />
            <circle cx={ghostPt[0]} cy={ghostPt[1]} r="20" fill="#fff" stroke="#e5372a" strokeWidth="10" />
          </g>
        )}
        <circle className={styles.halo} cx={x} cy={y} r="60" style={{ fill: 'var(--accent)' }} />
        <circle cx={x} cy={y} r="24" fill="#fff" style={{ stroke: 'var(--accent)' }} strokeWidth="11" />
      </svg>
    </Bubble>
  )
}
