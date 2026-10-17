import { useEffect } from 'react'
import { useCesium } from 'resium'
import { markWorldReady } from '../world/ready'
import type { ShipTrack } from './shipTrack'

/** Reports the map as ready after the first frame with the ship on it. */
export function MapReady({ track }: { track: ShipTrack }) {
  const { viewer } = useCesium()
  useEffect(() => {
    if (!viewer) return
    const { scene, clock } = viewer
    const remove = scene.postRender.addEventListener(() => {
      if (!track.position.getValue(clock.currentTime)) return
      markWorldReady(true)
      remove()
    })
    return remove
  }, [viewer, track])
  return null
}
