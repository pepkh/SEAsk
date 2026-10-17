import {
  Cartesian3,
  Math as CesiumMath,
  Matrix4,
  PerspectiveFrustum,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
} from 'cesium'
import { useEffect } from 'react'
import { useCesium } from 'resium'
import { IDLE_RETURN_MS, VIEWS, type ViewName } from '../scene/constants'
import type { ShipTrack } from './shipTrack'

const INPUTS = [
  ScreenSpaceEventType.LEFT_DOWN,
  ScreenSpaceEventType.RIGHT_DOWN,
  ScreenSpaceEventType.MIDDLE_DOWN,
  ScreenSpaceEventType.WHEEL,
  ScreenSpaceEventType.PINCH_START,
]

/** Sea-scene camera offset (ship frame: +x starboard, +y up, +z astern) in east-north-up metres. */
function offsetFor(view: ViewName, courseDeg: number): Cartesian3 {
  const [x, y, z] = VIEWS[view].pos
  const c = CesiumMath.toRadians(courseDeg)
  return new Cartesian3(Math.cos(c) * x - Math.sin(c) * z, -Math.sin(c) * x - Math.cos(c) * z, y)
}

/**
 * The camera follows the ship with the sea-scene view offsets. It glides to the selected view
 * and returns to it after 15 s with no input. Users can orbit and zoom around the ship.
 */
export function useMapCamera(view: ViewName, ship: ShipTrack) {
  const { viewer } = useCesium()

  useEffect(() => {
    if (!viewer) return
    const { scene, camera, clock } = viewer
    let lastInput = -1e9
    let last = performance.now()
    const handler = new ScreenSpaceEventHandler(scene.canvas)
    for (const type of INPUTS) handler.setInputAction(() => (lastInput = performance.now()), type)

    const remove = scene.preRender.addEventListener(() => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const pos = ship.position.getValue(clock.currentTime)
      if (!pos) return

      // Same framing as the sea scene: 32° vertical field of view in landscape, 50° in portrait.
      const { clientWidth: w, clientHeight: h } = scene.canvas
      if (camera.frustum instanceof PerspectiveFrustum) {
        camera.frustum.fov = w > h ? 2 * Math.atan(Math.tan(CesiumMath.toRadians(16)) * (w / h)) : CesiumMath.toRadians(50)
      }

      const goal = offsetFor(view, ship.course())
      const following = !Matrix4.equals(camera.transform, Matrix4.IDENTITY)
      let offset = following ? Cartesian3.clone(camera.position) : goal
      if (now - lastInput > IDLE_RETURN_MS) offset = Cartesian3.lerp(offset, goal, 1 - Math.exp(-dt * 1.2), new Cartesian3())
      camera.lookAtTransform(Transforms.eastNorthUpToFixedFrame(pos), offset)
    })

    return () => {
      remove()
      handler.destroy()
    }
  }, [viewer, view, ship])
}
