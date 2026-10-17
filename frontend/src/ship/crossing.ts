import type { ShipRow } from '../types/feed'
import { dockedAt, locate } from './sailing'

/** Rows of the crossing the ship is on (or, at the dock, the one that just arrived): indexes into the history. */
export interface CrossingRange {
  start: number
  end: number
  /** True when the history starts part-way through the crossing (the part before it was never recorded) */
  partial: boolean
}

/** Finds the current crossing in the history: back from the newest row to the last time the ship was docked. */
export function currentCrossing(history: ShipRow[]): CrossingRange | null {
  let i = history.length - 1
  if (i < 0) return null
  // At the dock: the crossing that just arrived is the one to look back on.
  while (i >= 0 && dockedAt(history[i])) i--
  if (i < 0) return null
  const end = i
  while (i >= 0 && !dockedAt(history[i])) i--
  return { start: i + 1, end, partial: i < 0 }
}

export type RewindTarget =
  | { kind: 'ok'; at: number }
  /** Not reached yet on this crossing */
  | { kind: 'ahead' }
  /** Sailed before the history starts */
  | { kind: 'unrecorded' }

/**
 * When the ship was at route fraction `target` on this crossing (the first row at or past it), so a tap on the
 * route map can rewind to that moment.
 */
export function timeAtFraction(history: ShipRow[], target: number): RewindTarget {
  const range = currentCrossing(history)
  if (!range) return { kind: 'unrecorded' }
  const first = locate(history[range.start].latitude, history[range.start].longitude).fraction
  const last = locate(history[range.end].latitude, history[range.end].longitude).fraction
  const toward = last >= first ? 1 : -1
  const past = (f: number, limit: number) => (toward === 1 ? f >= limit : f <= limit)
  if (!past(last, target)) return { kind: 'ahead' }
  if (range.partial && !past(target, first)) return { kind: 'unrecorded' }
  for (let i = range.start; i <= range.end; i++) {
    const row = history[i]
    if (past(locate(row.latitude, row.longitude).fraction, target)) return { kind: 'ok', at: Date.parse(row.time) }
  }
  return { kind: 'ahead' }
}

/** Route fraction where the recorded part of a partly recorded crossing begins, or null when it's all there. */
export function recordedFrom(history: ShipRow[]): number | null {
  const range = currentCrossing(history)
  if (!range?.partial) return null
  const row = history[range.start]
  return locate(row.latitude, row.longitude).fraction
}
