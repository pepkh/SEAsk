/*
 * Turning numbers into something anyone can read at a glance: a word, a comparison, a picture.
 * Pure functions, so they're easy to check and to tune.
 */
import type { PlaceKnowledge } from '../../types/landmark'
import type { Sailing } from '../../types/sailing'

const KN_TO_KMH = 1.852

export type SpeedLike = 'bike' | 'bus' | 'car'

/** What moves at about the ship's speed (25 and 50 km/h, as on the old Kids speed card). */
export function speedLike(kn: number): SpeedLike {
  const kmh = kn * KN_TO_KMH
  return kmh < 25 ? 'bike' : kmh < 50 ? 'bus' : 'car'
}

export type TripPhase = 'docked' | 'justLeft' | 'onTheWay' | 'halfway' | 'almostThere'

/** A phrase for where the trip is, from the share of the crossing that's done. */
export function tripPhase(sailing: Sailing): TripPhase {
  if (sailing.status === 'docked') return 'docked'
  const p = sailing.progress
  if (p < 0.12) return 'justLeft'
  if (p > 0.88) return 'almostThere'
  if (p >= 0.42 && p <= 0.58) return 'halfway'
  return 'onTheWay'
}

/** How full the tide is right now: 0 at the day's lowest water, 1 at its highest (heights evenly spaced over 24 h). */
export function tideFill(heights: number[], minuteOfDay: number): number {
  if (heights.length < 2) return 0.5
  const step = 1440 / (heights.length - 1)
  const k = Math.min(heights.length - 1, Math.max(0, minuteOfDay / step))
  const i = Math.min(heights.length - 2, Math.floor(k))
  const h = heights[i] + (heights[i + 1] - heights[i]) * (k - i)
  const lo = Math.min(...heights)
  const hi = Math.max(...heights)
  return hi > lo ? (h - lo) / (hi - lo) : 0.5
}

export type WindWord = 'calm' | 'breezy' | 'windy' | 'stormy'

export function windWord(kn: number): WindWord {
  return kn < 4 ? 'calm' : kn < 12 ? 'breezy' : kn < 22 ? 'windy' : 'stormy'
}

/** The four water readings shown in words, with the limits between their words. */
export const WATER_WORDS = {
  tsg_temperature: { group: 'temp', limits: [11, 14, 17], words: ['icy', 'chilly', 'cool', 'mild'] },
  // Below 27 PSU it's the Fraser River's fresh water on top of the sea (see DATA.md).
  salinity: { group: 'salt', limits: [27, 30], words: ['fresh', 'salty', 'verySalty'] },
  oxygen_saturation: { group: 'o2', limits: [80, 105], words: ['low', 'good', 'fizzy'] },
  chlorophyll: { group: 'plankton', limits: [1.5, 4], words: ['clear', 'green', 'veryGreen'] },
} as const

export type WaterKey = keyof typeof WATER_WORDS

/** The word for a reading (e.g. salinity 26 → "fresh"), or null when there is no reading. */
export function waterWord(key: WaterKey, value: number | null): string | null {
  if (value === null) return null
  const { limits, words } = WATER_WORDS[key]
  const i = limits.findIndex((limit) => value < limit)
  return words[i === -1 ? words.length - 1 : i]
}

/** Water depth as a building: about 3 m per storey. */
export function depthLike(m: number): number {
  return Math.max(1, Math.round(m / 3))
}

export type Specialty = NonNullable<PlaceKnowledge['specialties']>[number] & { thisMonth: boolean }

/** An island's specialties with what happens this month first (month 1–12), each marked. */
export function orderSpecialties(knowledge: PlaceKnowledge, month: number): Specialty[] {
  const all = (knowledge.specialties ?? []).map((s) => ({ ...s, thisMonth: !!s.months?.includes(month) }))
  return [...all.filter((s) => s.thisMonth), ...all.filter((s) => !s.thisMonth)]
}
