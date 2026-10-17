import { dockedAt } from '../../ship/sailing'
import type { TrackMeta } from '../../types/content'
import type { ShipRow } from '../../types/feed'

/** Legend ramp from the mockup: low value → high value. */
export const RAMP = ['#1B5A9C', '#2A8D8C', '#5AB86A', '#F5E58C']

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))

/** Ramp colour for a value inside the track range (values outside the range use the end colours). */
export function rampColor(value: number, track: TrackMeta): string {
  const t = Math.min(1, Math.max(0, (value - track.min) / (track.max - track.min))) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(t))
  const [a, b] = [hex(RAMP[i]), hex(RAMP[i + 1])]
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * (t - i))).join(',')})`
}

/** Rows of the current crossing: after the last row at a dock. Empty while the ship is docked. */
export function crossingRows(history: ShipRow[]): ShipRow[] {
  let last = -1
  for (let i = history.length - 1; i >= 0; i--) {
    if (dockedAt(history[i])) {
      last = i
      break
    }
  }
  return history.slice(last + 1)
}

/** Evenly spaced samples of a list (always keeps the first and the last item). */
export function sample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items
  return Array.from({ length: count }, (_, i) => items[Math.round((i * (items.length - 1)) / (count - 1))])
}
