import { anchoredLerp } from './geo'
import { ROUTE } from './sailing'

/*
 * Seafloor slice drawing from the mockup (viewBox 1848 × 600, depth stretched 25×).
 * The feed has no depth column, so the depth under the ship comes from this profile.
 */

export const SLICE_WIDTH = 1848
export const SURFACE_Y = 70
const PX_PER_M = 1.3

/** Seafloor line, Swartz Bay (left) to Tsawwassen (right) */
export const SLICE_PROFILE: [number, number][] = [
  [24, 96], [86, 116], [148, 161], [232, 226], [314, 284], [398, 317], [480, 298], [564, 252], [646, 213],
  [709, 174], [750, 161], [792, 180], [833, 161], [896, 213], [978, 304], [1103, 414], [1228, 486], [1310, 506],
  [1394, 473], [1497, 382], [1580, 265], [1663, 174], [1726, 122], [1788, 90], [1850, 80],
]

/** Slice x for a route fraction. Active Pass is at x 771, as in the mockup. */
export const sliceX = (fraction: number) => anchoredLerp(fraction, [[0, 24], [ROUTE.activePassAt, 771], [1, 1824]])

/** Seafloor y at a slice x. */
export function floorY(x: number): number {
  const i = Math.max(0, Math.min(SLICE_PROFILE.length - 2, SLICE_PROFILE.findIndex(([px]) => px >= x) - 1))
  const [[x0, y0], [x1, y1]] = [SLICE_PROFILE[i], SLICE_PROFILE[i + 1]]
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
}

/** Water depth under the ship in metres. */
export const depthAt = (fraction: number) => Math.round((floorY(sliceX(fraction)) - SURFACE_Y) / PX_PER_M)
