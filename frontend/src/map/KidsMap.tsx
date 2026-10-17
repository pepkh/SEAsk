import type { ViewName } from '../scene/constants'
import { useShip } from '../ship/ShipProvider'
import { MapScene } from './MapScene'
import { RouteLines } from './RouteLines'

/** Map mode of the Kids Journey screen: same camera views as the sea scene, with the route line. */
export default function KidsMap({ view }: { view: ViewName }) {
  const ship = useShip()
  return <MapScene view={view}>{ship && <RouteLines sailing={ship.sailing} />}</MapScene>
}
