import { useMemo } from 'react'
import type { ViewName } from '../scene/constants'
import { currentCrossing } from '../ship/crossing'
import { distanceM } from '../ship/geo'
import { useShip, useTimeShift } from '../ship/ShipProvider'
import type { ShipRow } from '../types/feed'
import type { LatLon } from '../types/route'
import { MapScene } from './MapScene'
import { RouteLines } from './RouteLines'

/** Track points closer together than this are skipped (m): enough detail for the line, far fewer points. */
const TRACK_STEP_M = 25

/** Where the ship really sailed on this crossing (empty at the dock, before it leaves). */
function sailedTrack(history: ShipRow[]): LatLon[] {
  const range = currentCrossing(history)
  if (!range || range.end !== history.length - 1) return []
  const points: LatLon[] = []
  for (let i = range.start; i <= range.end; i++) {
    const p: LatLon = [history[i].latitude, history[i].longitude]
    if (!points.length || i === range.end || distanceM(points[points.length - 1], p) >= TRACK_STEP_M) points.push(p)
  }
  return points
}

/** Map mode of the ferry screen: same camera views as the sea scene, with the crossing drawn. Follows a rewind. */
export default function KidsMap({ view, paused = false }: { view: ViewName; paused?: boolean }) {
  const ship = useShip()
  const { jump } = useTimeShift()
  const history = ship?.history
  const track = useMemo(() => (history ? sailedTrack(history) : []), [history])
  const row = ship?.row
  return (
    <MapScene view={view} paused={paused} trackKey={jump}>
      {ship && row && (
        <RouteLines
          sailing={ship.sailing}
          track={track}
          ship={{ position: [row.latitude, row.longitude], courseDeg: row.ship_course, speedKn: row.speed_over_ground }}
        />
      )}
    </MapScene>
  )
}
