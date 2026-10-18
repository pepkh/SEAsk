import { pointAt, ROUTE, ROUTE_LENGTH_M, zoneAt } from '../../ship/sailing'
import type { Direction } from '../../types/bridge'
import { gridValue } from '../field'
import type { Fouling } from '../model'

/*
 * The experimental biofouling index along the route: a profile in route bins and the stretches where
 * it is elevated (hotspots), numbered from Swartz Bay. The model ranks places on its own day only, so
 * the threshold is a design choice (SOURCES.md, set by hand), not a level the model defines.
 */

export const FOULING = {
  /** Score from which a stretch is a hotspot (relative 0-100) */
  elevated: 65,
  /** Shorter elevated stretches are left out */
  minNm: 0.5,
  /** Same bins as the route profile */
  bins: 200,
  /** Below this speed the time to a hotspot uses the service speed */
  minKn: 5,
} as const

const ROUTE_NM = ROUTE_LENGTH_M / 1852

export interface FoulingProfile {
  /** Bin centres as route fractions (0 Swartz Bay, 1 Tsawwassen) */
  frac: Float32Array
  /** NaN where the model has no estimate */
  score: Float32Array
  spread: Float32Array
  lengthNm: number
}

export interface Hotspot {
  /** F1, F2, … from Swartz Bay */
  id: string
  /** Route fractions */
  from: number
  to: number
  peak: number
  /** Scenario spread at the peak */
  spread: number
  zone: string
  lengthNm: number
}

export interface HotspotAhead {
  hotspot: Hotspot
  inside: boolean
  /** To its start (0 inside) */
  distNm: number
  /** Inside: to its end */
  leftNm: number
  minutes: number
}

/** Score and spread at a place, or null without an estimate. */
export function foulingAt(f: Fouling, lat: number, lon: number): { score: number; spread: number } | null {
  const score = gridValue(f.grid, f.score, lat, lon)
  if (!Number.isFinite(score)) return null
  return { score, spread: gridValue(f.grid, f.spread, lat, lon) }
}

export function foulingProfile(f: Fouling, bins: number = FOULING.bins): FoulingProfile {
  const frac = new Float32Array(bins)
  const score = new Float32Array(bins).fill(NaN)
  const spread = new Float32Array(bins).fill(NaN)
  for (let b = 0; b < bins; b++) {
    frac[b] = (b + 0.5) / bins
    const [lat, lon] = pointAt(frac[b])
    const v = foulingAt(f, lat, lon)
    if (v) {
      score[b] = v.score
      spread[b] = v.spread
    }
  }
  return { frac, score, spread, lengthNm: ROUTE_NM }
}

const ALONG_ROUTE = new WeakMap<Fouling, { profile: FoulingProfile; hotspots: Hotspot[] }>()

/** Profile and hotspots of a model run, worked out once per run (the map and the rail both use them). */
export function foulingAlongRoute(f: Fouling): { profile: FoulingProfile; hotspots: Hotspot[] } {
  let r = ALONG_ROUTE.get(f)
  if (!r) {
    const profile = foulingProfile(f)
    r = { profile, hotspots: foulingHotspots(profile) }
    ALONG_ROUTE.set(f, r)
  }
  return r
}

/** Runs of bins at or above the threshold, at least `minNm` long. */
export function foulingHotspots(p: FoulingProfile): Hotspot[] {
  const bins = p.frac.length
  const out: Hotspot[] = []
  let start = -1
  for (let b = 0; b <= bins; b++) {
    const hot = b < bins && p.score[b] >= FOULING.elevated
    if (hot && start < 0) start = b
    if (hot || start < 0) continue
    const lengthNm = ((b - start) / bins) * p.lengthNm
    if (lengthNm >= FOULING.minNm) {
      let peakBin = start
      for (let k = start; k < b; k++) if (p.score[k] > p.score[peakBin]) peakBin = k
      const from = start / bins
      const to = b / bins
      out.push({
        id: `F${out.length + 1}`,
        from,
        to,
        peak: p.score[peakBin],
        spread: p.spread[peakBin],
        zone: zoneAt((from + to) / 2),
        lengthNm,
      })
    }
    start = -1
  }
  return out
}

/** The hotspot the ship is in or comes to next on this crossing, or null when none is ahead. */
export function nextHotspot(hotspots: Hotspot[], frac: number, direction: Direction, sogKn: number): HotspotAhead | null {
  const east = direction === 'swb_to_tsa'
  const ahead = hotspots.filter((h) => (east ? h.to > frac : h.from < frac))
  const hotspot = east ? ahead[0] : ahead[ahead.length - 1]
  if (!hotspot) return null
  const inside = hotspot.from <= frac && frac <= hotspot.to
  const distNm = inside ? 0 : (east ? hotspot.from - frac : frac - hotspot.to) * ROUTE_NM
  const leftNm = inside ? (east ? hotspot.to - frac : frac - hotspot.from) * ROUTE_NM : hotspot.lengthNm
  const kn = Number.isFinite(sogKn) && sogKn >= FOULING.minKn ? sogKn : ROUTE.serviceSpeedKn
  return { hotspot, inside, distNm, leftNm, minutes: ((inside ? leftNm : distNm) / kn) * 60 }
}
