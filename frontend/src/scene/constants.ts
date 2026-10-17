/* Sea scene constants from the Home mockup. The map scene uses the same camera views. */

/** Water speed on screen in m/s (real ~9.6 m/s, faster so the motion reads) */
export const VIS_SPEED = 24
/** Speed at which the sea moves at VIS_SPEED (knots) */
export const CRUISE_KN = 18.6

export const HORIZON = '#e1ecef'
export const SUN_POSITION: [number, number, number] = [-260, 320, 140]

export type ViewName = 'chase' | 'side' | 'top'
type Vec3 = [number, number, number]

/** Camera position and target in metres. Ship frame: bow = -z, starboard = +x, up = +y. */
export const VIEWS: Record<ViewName, { pos: Vec3; tgt: Vec3 }> = {
  chase: { pos: [-235, 92, 205], tgt: [10, 10, -20] },
  side: { pos: [-330, 30, 10], tgt: [0, 12, 0] },
  top: { pos: [-60, 520, 260], tgt: [0, 0, -60] },
}

/** The camera returns to the selected view after this time with no input. */
export const IDLE_RETURN_MS = 15000
