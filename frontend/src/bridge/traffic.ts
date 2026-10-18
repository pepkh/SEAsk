import type { Vessel } from './model'

/** Fixes further apart than this are not joined (the vessel was out of radio range). */
const MAX_GAP_MS = 6 * 60_000
/** A vessel is carried forward on its course this long after its last fix, then shown stale. */
const DEAD_RECKON_MS = 3 * 60_000
/** Older than this, the vessel is not shown. */
const HIDE_AFTER_MS = 15 * 60_000

export interface VesselNow {
  v: Vessel
  lat: number
  lon: number
  sogKn: number
  cogDeg: number
  hdgDeg: number
  /** The last fix is older than DEAD_RECKON_MS */
  stale: boolean
}

/** Index of the last fix at or before `t` (-1 before the first). */
function fixBefore(times: Float64Array, t: number): number {
  let lo = 0
  let hi = times.length - 1
  if (hi < 0 || t < times[0]) return -1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (times[mid] <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

const turn = (a: number, b: number, k: number) => {
  if (!Number.isFinite(a)) return b
  if (!Number.isFinite(b)) return a
  return (a + ((((b - a + 540) % 360) - 180) * k) + 360) % 360
}

/** Where a vessel is at `t`: between two fixes, a little past the last one, or null. */
export function vesselAt(v: Vessel, t: number): VesselNow | null {
  const i = fixBefore(v.t, t)
  if (i < 0) return null
  const j = i + 1
  if (j < v.t.length && v.t[j] - v.t[i] <= MAX_GAP_MS) {
    const k = (t - v.t[i]) / (v.t[j] - v.t[i])
    return {
      v,
      lat: v.lat[i] + (v.lat[j] - v.lat[i]) * k,
      lon: v.lon[i] + (v.lon[j] - v.lon[i]) * k,
      sogKn: v.sogKn[i] + (v.sogKn[j] - v.sogKn[i]) * k,
      cogDeg: turn(v.cogDeg[i], v.cogDeg[j], k),
      hdgDeg: turn(v.hdgDeg[i], v.hdgDeg[j], k),
      stale: false,
    }
  }
  const age = t - v.t[i]
  if (age > HIDE_AFTER_MS) return null
  const reckon = Math.min(age, DEAD_RECKON_MS) / 1000
  const sog = Number.isFinite(v.sogKn[i]) ? v.sogKn[i] : 0
  const cog = ((Number.isFinite(v.cogDeg[i]) ? v.cogDeg[i] : 0) * Math.PI) / 180
  const metres = sog * (1852 / 3600) * reckon
  return {
    v,
    lat: v.lat[i] + (metres * Math.cos(cog)) / 110_574,
    lon: v.lon[i] + (metres * Math.sin(cog)) / (111_320 * Math.cos((v.lat[i] * Math.PI) / 180)),
    sogKn: sog,
    cogDeg: v.cogDeg[i],
    hdgDeg: v.hdgDeg[i],
    stale: age > DEAD_RECKON_MS,
  }
}
