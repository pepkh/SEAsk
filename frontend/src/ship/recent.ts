import type { ShipRow } from '../types/feed'

/**
 * The rows of the last `ms` before the newest row. By time, not by count: a session starts with rows 5 s apart
 * (the history fill-in) and then adds one each second.
 */
export function recentRows(history: ShipRow[], ms: number): ShipRow[] {
  const last = history[history.length - 1]
  if (!last) return []
  const since = Date.parse(last.time) - ms
  let from = history.length
  while (from > 0 && Date.parse(history[from - 1].time) >= since) from--
  return history.slice(from)
}
