import type { LatLon } from '../types/route'

const EARTH_RADIUS_M = 6371008.8
const toRad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance in metres. */
export function distanceM([lat1, lon1]: LatLon, [lat2, lon2]: LatLon): number {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** Bearing from a to b in degrees true (0–360). */
export function bearingDeg([lat1, lon1]: LatLon, [lat2, lon2]: LatLon): number {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2))
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** Cumulative distance in metres at each point of a polyline. */
export function cumulativeM(points: LatLon[]): number[] {
  const out = [0]
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + distanceM(points[i - 1], points[i]))
  return out
}

export interface Projection {
  /** Distance along the line in metres */
  alongM: number
  /** Index of the segment that holds the closest point */
  segment: number
}

/**
 * Closest point on a polyline. Uses a local flat projection,
 * which is accurate enough over a 45 km route.
 */
export function projectOnLine(p: LatLon, points: LatLon[], cumulative: number[]): Projection {
  const kx = Math.cos(toRad(p[0])) * 111320
  const ky = 110574
  let best = { alongM: 0, segment: 0, d2: Infinity }
  for (let i = 0; i < points.length - 1; i++) {
    const ax = points[i][1] * kx, ay = points[i][0] * ky
    const bx = points[i + 1][1] * kx, by = points[i + 1][0] * ky
    const px = p[1] * kx, py = p[0] * ky
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
    const cx = ax + t * dx, cy = ay + t * dy
    const d2 = (px - cx) ** 2 + (py - cy) ** 2
    if (d2 < best.d2) best = { alongM: cumulative[i] + t * (cumulative[i + 1] - cumulative[i]), segment: i, d2 }
  }
  return { alongM: best.alongM, segment: best.segment }
}

/** Point at a distance along a polyline (linear between points). */
export function pointAlong(points: LatLon[], cumulative: number[], alongM: number): LatLon {
  const next = cumulative.findIndex((c) => c > alongM)
  const i = next === -1 ? points.length - 2 : Math.max(0, next - 1)
  const span = cumulative[i + 1] - cumulative[i]
  const t = span ? Math.min(1, Math.max(0, (alongM - cumulative[i]) / span)) : 0
  return [points[i][0] + t * (points[i + 1][0] - points[i][0]), points[i][1] + t * (points[i + 1][1] - points[i][1])]
}

/** Piecewise-linear map through anchor pairs [x, y], sorted by x. */
export function anchoredLerp(x: number, anchors: [number, number][]): number {
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i]
    const [x1, y1] = anchors[i + 1]
    if (x <= x1 || i === anchors.length - 2) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
  }
  return anchors[0][1]
}
