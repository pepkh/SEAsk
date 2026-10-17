import type { ViewName } from '../scene/constants'
import type { TrackMeta } from '../types/content'
import type { ShipRow } from '../types/feed'
import type { Sailing } from '../types/sailing'
import { LatLonGrid } from './LatLonGrid'
import { MapScene } from './MapScene'
import { RouteLines } from './RouteLines'
import { TrackLine } from './TrackLine'

interface Props {
  view: ViewName
  sailing: Sailing
  crossing: ShipRow[]
  track: TrackMeta
}

/** Map mode of the Grown-ups Journey screen: the Kids camera views, with the coloured track and the remaining route (grid in the top view). */
export default function AdultsMap({ view, sailing, crossing, track }: Props) {
  return (
    <MapScene view={view}>
      <RouteLines sailing={sailing} showTravelled={false} />
      <TrackLine crossing={crossing} track={track} />
      {view === 'top' && <LatLonGrid />}
    </MapScene>
  )
}
