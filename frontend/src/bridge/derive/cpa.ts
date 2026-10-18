/*
 * Closest point of approach between two vessels on straight courses, in a local flat frame
 * (fine over the few miles that matter for collision avoidance).
 */

const M_PER_NM = 1852
const KN_TO_MS = 1852 / 3600

export interface Track {
  lat: number
  lon: number
  sogKn: number
  cogDeg: number
}

export interface Cpa {
  /** Distance now, nautical miles */
  rangeNm: number
  /** Bearing from own ship to the target, degrees true */
  bearingDeg: number
  /** Closest distance, nautical miles */
  cpaNm: number
  /** Minutes until the closest point (0 when already past it) */
  tcpaMin: number
}

/** CPA/TCPA of `target` seen from `own`. Missing speed or course counts as stopped. */
export function cpaOf(own: Track, target: Track): Cpa {
  const kx = Math.cos((own.lat * Math.PI) / 180) * 111_320
  const ky = 110_574
  const rx = (target.lon - own.lon) * kx
  const ry = (target.lat - own.lat) * ky
  const vel = (t: Track) => {
    const s = Number.isFinite(t.sogKn) && Number.isFinite(t.cogDeg) ? t.sogKn * KN_TO_MS : 0
    const c = ((Number.isFinite(t.cogDeg) ? t.cogDeg : 0) * Math.PI) / 180
    return [s * Math.sin(c), s * Math.cos(c)]
  }
  const [ox, oy] = vel(own)
  const [tx, ty] = vel(target)
  const vx = tx - ox
  const vy = ty - oy
  const v2 = vx * vx + vy * vy
  const range = Math.hypot(rx, ry)
  const tcpa = v2 > 1e-6 ? Math.max(0, -(rx * vx + ry * vy) / v2) : 0
  const cpa = Math.hypot(rx + vx * tcpa, ry + vy * tcpa)
  return {
    rangeNm: range / M_PER_NM,
    bearingDeg: ((Math.atan2(rx, ry) * 180) / Math.PI + 360) % 360,
    cpaNm: cpa / M_PER_NM,
    tcpaMin: tcpa / 60,
  }
}

/** A target worth a warning: closer than `cpaNm` within `minutes`. */
export const isDanger = (c: Cpa, cpaNm = 0.5, minutes = 20) => c.cpaNm < cpaNm && c.tcpaMin > 0 && c.tcpaMin < minutes
