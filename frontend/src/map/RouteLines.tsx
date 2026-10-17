import { CallbackProperty, Color, PolylineDashMaterialProperty, type Cartesian3, type MaterialProperty } from 'cesium'
import { useEffect, useMemo } from 'react'
import { Entity, PolylineGraphics } from 'resium'
import { distanceM, offsetM } from '../ship/geo'
import { ROUTE, ROUTE_LENGTH_M, routeBetween } from '../ship/sailing'
import type { LatLon } from '../types/route'
import type { Sailing } from '../types/sailing'
import { toPositions } from './positions'
import { RENDER_DELAY_S } from './shipTrack'

const ACCENT = Color.fromCssColorString('#1F6FE0')
/** The lines stop this far from the middle of the ship (m): half the 160 m ferry, plus a little water. */
const SHIP_GAP_M = 120
/** The dashed line joins the planned route this far ahead of the ship (m). */
const MERGE_M = 900
const KN_TO_MS = 0.514444
const AHEAD = new PolylineDashMaterialProperty({ color: Color.fromCssColorString('#5E7480'), dashLength: 16 })

/** A position property that Cesium reads every frame, with a setter for new points. */
function createLivePositions() {
  let positions: Cartesian3[] = []
  return {
    property: new CallbackProperty(() => positions, false),
    set: (next: Cartesian3[]) => {
      positions = next
    },
  }
}

/**
 * A line whose points change with each feed row. A CallbackProperty makes Cesium draw it
 * as a dynamic line every frame, so it never waits for a background geometry rebuild.
 */
function LiveLine({ points, width, material }: { points: LatLon[]; width: number; material: Color | MaterialProperty }) {
  const live = useMemo(() => createLivePositions(), [])
  useEffect(() => live.set(toPositions(points)))
  return (
    <Entity>
      <PolylineGraphics positions={live.property} width={width} material={material} />
    </Entity>
  )
}

/** Where the ship is and where it's going, from the newest feed row. */
export interface ShipFix {
  position: LatLon
  /** Course over ground, degrees true */
  courseDeg: number
  speedKn: number
}

interface Props {
  sailing: Sailing
  /** Where the ship really sailed on this crossing, oldest first. Without it, the planned route is drawn instead. */
  track?: LatLon[]
  /** The newest fix: both lines then start and end at the ship as drawn, not at the planned route */
  ship?: ShipFix
  showTravelled?: boolean
}

/**
 * The crossing split at the ship: the part sailed solid accent (the real track when there is one), the part ahead
 * dashed. The dashed line leaves from just ahead of the bow along the ship's course and joins the planned route a
 * little further on, since the ship is rarely exactly on the planned line.
 */
export function RouteLines({ sailing, track, ship, showTravelled = true }: Props) {
  const departure = sailing.direction === 1 ? 0 : 1
  const gap = (SHIP_GAP_M / (sailing.totalKm * 1000)) * sailing.direction
  const behind = Math.min(1, Math.max(0, sailing.fraction - gap))
  const moving = sailing.status === 'sailing' && !!ship
  // The map draws the ship RENDER_DELAY_S behind the newest fix, so the lines hang off where it's drawn.
  const lagM = moving ? ship.speedKn * KN_TO_MS * RENDER_DELAY_S : 0
  const travelled = track ? trimEnd(track, lagM + SHIP_GAP_M) : behind !== departure ? routeBetween(departure, behind) : []
  const ahead = moving ? aheadFrom(ship, lagM, sailing) : plannedAhead(sailing, gap)
  return (
    <>
      {showTravelled && travelled.length > 1 && <LiveLine points={travelled} width={6} material={ACCENT} />}
      {ahead.length > 1 && <LiveLine points={ahead} width={4} material={AHEAD} />}
    </>
  )
}

/** The planned route from just past the ship to the arrival terminal (at the dock, or with no fix). */
function plannedAhead(sailing: Sailing, gap: number): LatLon[] {
  const arrival = sailing.direction === 1 ? 1 : 0
  const from = Math.min(1, Math.max(0, sailing.fraction + gap))
  return from === arrival ? [] : routeBetween(from, arrival)
}

/** From just ahead of the bow along the course, then the planned route on to the arrival terminal. */
function aheadFrom(ship: ShipFix, lagM: number, sailing: Sailing): LatLon[] {
  const start = offsetM(ship.position, ship.courseDeg, SHIP_GAP_M - lagM)
  const merge = sailing.fraction + (MERGE_M / ROUTE_LENGTH_M) * sailing.direction
  if (sailing.direction === 1) return merge >= 1 ? [start, ROUTE.points[ROUTE.points.length - 1]] : [start, ...routeBetween(merge, 1)]
  return merge <= 0 ? [start, ROUTE.points[0]] : [start, ...routeBetween(0, merge).reverse()]
}

/** The track without its last `m` metres from the newest fix, so the line stops just behind the stern as drawn. */
function trimEnd(track: LatLon[], m: number): LatLon[] {
  const end = track[track.length - 1]
  let i = track.length - 1
  while (i > 0 && distanceM(track[i], end) < m) i--
  return track.slice(0, i + 1)
}
