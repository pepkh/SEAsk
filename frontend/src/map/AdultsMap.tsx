import type { TrackMeta } from '../types/content'
import type { ShipRow } from '../types/feed'
import type { Sailing } from '../types/sailing'
import { LatLonGrid } from './LatLonGrid'
import { MapScene } from './MapScene'
import { RouteLines } from './RouteLines'
import { TrackLine } from './TrackLine'

interface Props {
  sailing: Sailing
  crossing: ShipRow[]
  track: TrackMeta
}

/** Map mode of the Grown-ups Journey screen: top view, coloured track, remaining route and grid. */
export default function AdultsMap({ sailing, crossing, track }: Props) {
  return (
    <MapScene view="top">
      <RouteLines sailing={sailing} showTravelled={false} />
      <TrackLine crossing={crossing} track={track} />
      <LatLonGrid />
    </MapScene>
  )
}
