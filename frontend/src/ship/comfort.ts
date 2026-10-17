import { FEED_POLL_MS } from '../config/env'
import type { ShipRow } from '../types/feed'

export type Comfort = 'calm' | 'gentle' | 'rolly'

const WINDOW_ROWS = (60 * 1000) / FEED_POLL_MS
const MIN_ROWS = 10
/**
 * Limits on the standard deviation of roll over the last minute, degrees. The same as
 * backend/scripts/build_derived.py: on 2026-08-17 underway it was below 0.5 for 75% of the time,
 * 0.5 to 1 for 20% and above 1 for 5% (mostly the turns in Active Pass).
 */
const CALM_MAX_DEG = 0.5
const GENTLE_MAX_DEG = 1

/** How much the ship rolls over the last minute, or null with too few roll readings. */
export function comfortOf(history: ShipRow[]): Comfort | null {
  const rolls = history.slice(-WINDOW_ROWS).flatMap((r) => (r.roll === null ? [] : [r.roll]))
  if (rolls.length < MIN_ROWS) return null
  const mean = rolls.reduce((s, v) => s + v, 0) / rolls.length
  const std = Math.sqrt(rolls.reduce((s, v) => s + (v - mean) ** 2, 0) / (rolls.length - 1))
  return std < CALM_MAX_DEG ? 'calm' : std < GENTLE_MAX_DEG ? 'gentle' : 'rolly'
}
