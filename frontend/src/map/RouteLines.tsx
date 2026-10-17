import { CallbackProperty, Color, PolylineDashMaterialProperty, type Cartesian3, type MaterialProperty } from 'cesium'
import { useEffect, useMemo } from 'react'
import { Entity, PolylineGraphics } from 'resium'
import { routeBetween } from '../ship/sailing'
import type { LatLon } from '../types/route'
import type { Sailing } from '../types/sailing'
import { toPositions } from './positions'

const ACCENT = Color.fromCssColorString('#1F6FE0')
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

/** Planned route split at the ship: travelled part solid accent, remaining part dashed (as on the mini map). */
export function RouteLines({ sailing, showTravelled = true }: { sailing: Sailing; showTravelled?: boolean }) {
  const departure = sailing.direction === 1 ? 0 : 1
  return (
    <>
      {showTravelled && sailing.progress > 0 && (
        <LiveLine points={routeBetween(departure, sailing.fraction)} width={6} material={ACCENT} />
      )}
      {sailing.progress < 1 && <LiveLine points={routeBetween(sailing.fraction, 1 - departure)} width={4} material={AHEAD} />}
    </>
  )
}
