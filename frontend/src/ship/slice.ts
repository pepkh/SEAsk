import { anchoredLerp } from './geo'
import { BUNDLED_PROFILE } from './profile'
import { ROUTE } from './sailing'

/*
 * Seafloor slice drawing (viewBox 1848 × 600, depth stretched 25×). The seafloor line is the
 * GEBCO 2026 depth under the route line, from the route profile (backend/scripts/build_derived.py).
 */

export const SLICE_WIDTH = 1848
export const SURFACE_Y = 70
const PX_PER_M = 1.3
/** Bins on each side in the moving average: GEBCO cells (~460 m) are about two bins (~230 m) wide. */
const SMOOTH_BINS = 2

const BINS = BUNDLED_PROFILE.bins
const raw = BINS.map((b) => b.depth_m ?? 0)
const depth = raw.map((_, i) => {
  const window = raw.slice(Math.max(0, i - SMOOTH_BINS), i + SMOOTH_BINS + 1)
  return window.reduce((sum, v) => sum + v, 0) / window.length
})
const floorAt = (m: number) => SURFACE_Y + m * PX_PER_M

/** Slice x for a route fraction. Active Pass is at x 771, as in the mockup. */
export const sliceX = (fraction: number) => anchoredLerp(fraction, [[0, 24], [ROUTE.activePassAt, 771], [1, 1824]])

/** Seafloor line, Swartz Bay (left) to Tsawwassen (right) */
export const SLICE_PROFILE: [number, number][] = [
  [24, floorAt(depth[0])],
  ...BINS.map((b, i): [number, number] => [sliceX(b.fraction), floorAt(depth[i])]),
  [SLICE_WIDTH + 2, floorAt(depth[depth.length - 1])],
]

/** Seafloor y at a slice x. */
export function floorY(x: number): number {
  const i = Math.max(0, Math.min(SLICE_PROFILE.length - 2, SLICE_PROFILE.findIndex(([px]) => px >= x) - 1))
  const [[x0, y0], [x1, y1]] = [SLICE_PROFILE[i], SLICE_PROFILE[i + 1]]
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
}

/** Water depth under the ship in metres, read off the drawn seafloor line. */
export const depthAt = (fraction: number) => Math.round((floorY(sliceX(fraction)) - SURFACE_Y) / PX_PER_M)
