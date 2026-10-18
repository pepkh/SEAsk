import type { TideCurrent, TideStation, Tides } from '../model'
import { valueAt } from '../series'

export interface TideNow {
  code: string
  name: string
  /** m above chart datum */
  h: number
  rising: boolean | null
  next: { type: 'high' | 'low'; h: number; t: number } | null
}

/** Water level at a tide station at `t`, whether it is rising, and the next high or low. */
export function tideNow(tides: Tides, s: TideStation, t: number): TideNow {
  const h = valueAt(tides.axis, s.h, t)
  const later = valueAt(tides.axis, s.h, t + 10 * 60_000)
  return {
    code: s.code,
    name: s.name,
    h,
    rising: Number.isFinite(h) && Number.isFinite(later) ? later > h : null,
    next: s.extremes.find((e) => e.t > t) ?? null,
  }
}

export interface CurrentNow {
  station: string
  kn: number
  /** + flood, − ebb */
  signedKn: number
  towardDeg: number
  flooding: boolean | null
  nextSlack: number | null
  /** Next maximum flood or ebb */
  nextMax: { type: 'flood' | 'ebb'; t: number; kn: number } | null
}

/** The tidal current at `t`. */
export function currentNow(tides: Tides, c: TideCurrent, t: number): CurrentNow {
  const signed = valueAt(tides.axis, c.signedKn, t)
  const max = c.events.find((e) => e.t > t && e.type !== 'slack')
  return {
    station: c.station,
    kn: Math.abs(signed) || valueAt(tides.axis, c.kn, t),
    signedKn: signed,
    towardDeg: valueAt(tides.axis, c.towardDeg, t),
    flooding: Number.isFinite(signed) ? signed > 0 : null,
    nextSlack: c.events.find((e) => e.t > t && e.type === 'slack')?.t ?? null,
    nextMax: max ? { type: max.type as 'flood' | 'ebb', t: max.t, kn: max.kn } : null,
  }
}
