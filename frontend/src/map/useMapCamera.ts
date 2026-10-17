import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Matrix4,
  PerspectiveFrustum,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
} from 'cesium'
import { useEffect, type RefObject } from 'react'
import { useCesium } from 'resium'
import { IDLE_RETURN_MS, MAP_VIEWS, ORBIT_PERIOD_S, type ViewName } from '../scene/constants'
import type { ShipTrack } from './shipTrack'

const INPUTS = [
  ScreenSpaceEventType.LEFT_DOWN,
  ScreenSpaceEventType.RIGHT_DOWN,
  ScreenSpaceEventType.MIDDLE_DOWN,
  ScreenSpaceEventType.WHEEL,
  ScreenSpaceEventType.PINCH_START,
]

const ORBIT_RATE = (2 * Math.PI) / ORBIT_PERIOD_S
/** The idle camera stays at least this high above the ground below it (narrow passes such as Active Pass). */
const GROUND_CLEARANCE_M = 60
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

/**
 * Camera offset (ship frame: +x starboard, +y up, +z astern), turned `orbit` radians
 * around the ship (as three.js applyAxisAngle about +y), in east-north-up metres.
 */
function offsetFor(view: ViewName, courseDeg: number, orbit: number): Cartesian3 {
  const [px, y, pz] = MAP_VIEWS[view]
  const x = Math.cos(orbit) * px + Math.sin(orbit) * pz
  const z = -Math.sin(orbit) * px + Math.cos(orbit) * pz
  const c = CesiumMath.toRadians(courseDeg)
  return new Cartesian3(Math.cos(c) * x - Math.sin(c) * z, -Math.sin(c) * x - Math.cos(c) * z, y)
}

/**
 * The camera follows the ship with the map view offsets. It glides to the selected view
 * and returns to it after 15 s with no input; while idle it slowly circles the ship (not in the top view,
 * not while `hold` is true, e.g. when a landmark label is open). Users can orbit and zoom around the ship.
 */
export function useMapCamera(view: ViewName, ship: ShipTrack, hold?: RefObject<boolean>) {
  const { viewer } = useCesium()

  useEffect(() => {
    if (!viewer) return
    const { scene, camera, clock } = viewer
    let lastInput = -1e9
    let last = performance.now()
    let orbit = 0
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

      const idle = now - lastInput > IDLE_RETURN_MS
      if (idle && view !== 'top' && !reducedMotion.matches && !hold?.current) orbit += dt * ORBIT_RATE
      const enu = Transforms.eastNorthUpToFixedFrame(pos)
      const goal = offsetFor(view, ship.heading(), view === 'top' ? 0 : orbit)
      const ground = scene.globe.getHeight(Cartographic.fromCartesian(Matrix4.multiplyByPoint(enu, goal, new Cartesian3())))
      if (ground !== undefined) goal.z = Math.max(goal.z, ground + GROUND_CLEARANCE_M)
      const following = !Matrix4.equals(camera.transform, Matrix4.IDENTITY)
      let offset = following ? Cartesian3.clone(camera.position) : goal
      if (idle) offset = Cartesian3.lerp(offset, goal, 1 - Math.exp(-dt * 1.2), new Cartesian3())
      camera.lookAtTransform(enu, offset)
    })

    return () => {
      remove()
      handler.destroy()
    }
  }, [viewer, view, ship, hold])
}
