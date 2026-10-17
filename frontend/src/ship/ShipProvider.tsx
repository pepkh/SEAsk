import { useContext, useEffect, useState, type ReactNode } from 'react'
import { getHistory, getLatestRow, type FeedHistory } from '../api/shipFeed'
import { FEED_POLL_MS } from '../config/env'
import { useSession } from '../context/SessionContext'
import type { ShipRow } from '../types/feed'
import type { DataSource } from '../types/source'
import { deriveSailing } from './sailing'
import { LiveShipContext, ShownShipContext, TimeShiftContext, type ShipState, type TimeShiftValue } from './shipContext'
import { TimeShiftProvider } from './TimeShiftProvider'

export type { ShipState } from './shipContext'

/** Minutes of history kept (a crossing is about 80), and filled in when a session starts. */
const HISTORY_MIN = 90
const HISTORY_MS = HISTORY_MIN * 60_000

/**
 * Polls the ship feed during a visitor session and gives the latest row, the history and the sailing state.
 * Polling starts at once; the whole current crossing (fetched once per session, since nothing is polled on the
 * welcome screen) is added behind the polled rows when it arrives. That history is what "rewind the trip" plays back.
 * The screens never wait for it: with live data it can take a few seconds.
 */
export function ShipProvider({ children }: { children: ReactNode }) {
  const { active, id: sessionId } = useSession()
  const [state, setState] = useState<ShipState | null>(null)

  useEffect(() => {
    // No session (welcome screen): no requests.
    if (!active) return
    let live = true
    let busy = false
    let history: ShipRow[] = []
    let source: DataSource | undefined
    /** History that arrived before the first poll said which source is in use */
    let pending: FeedHistory | undefined

    /** Puts the fetched history behind the polled rows, if it comes from the same source. */
    const addPast = (past: FeedHistory) => {
      if (past.source !== source) return
      const first = history.length ? Date.parse(history[0].time) : Infinity
      history = [...past.rows.filter((row) => Date.parse(row.time) < first), ...history]
    }

    const poll = async () => {
      // A slow backend answer must not start a second request.
      if (busy) return
      busy = true
      try {
        const next = await getLatestRow()
        if (!live) return
        // Live and sample positions differ, so a new source starts a new history (no jump in the track).
        if (next.source !== source) history = []
        source = next.source
        if (pending) {
          addPast(pending)
          pending = undefined
        }
        // Rows are in time order, so only the oldest few can be too old.
        const cutoff = Date.parse(next.row.time) - HISTORY_MS
        let drop = 0
        while (drop < history.length && Date.parse(history[drop].time) < cutoff) drop++
        history = [...history.slice(drop), next.row]
        setState({ row: next.row, history, sailing: deriveSailing(next.row, history), source: next.source })
      } catch (err) {
        console.error(err)
      } finally {
        busy = false
      }
    }

    poll()
    const timer = setInterval(poll, FEED_POLL_MS)
    getHistory(HISTORY_MIN)
      .then((past) => {
        if (!live) return
        if (!source) {
          pending = past
          return
        }
        addPast(past)
        // Show it now (the map's track, the route map's rewind), not only at the next poll.
        setState((prev) => prev && { ...prev, history, sailing: deriveSailing(prev.row, history) })
      })
      .catch((err) => console.error(err))
    return () => {
      live = false
      clearInterval(timer)
      // The next visitor starts with a fresh history.
      setState(null)
    }
  }, [active])

  return (
    <LiveShipContext value={state}>
      <TimeShiftProvider live={state} session={sessionId}>
        {children}
      </TimeShiftProvider>
    </LiveShipContext>
  )
}

/** The ship state the screens show (the live one, or the rewound moment), or null until the first row arrives. */
// eslint-disable-next-line react/only-export-components
export const useShip = () => useContext(ShownShipContext)

/** Always the newest state from the feed, even while rewound. */
// eslint-disable-next-line react/only-export-components
export const useLiveShip = () => useContext(LiveShipContext)

/** Rewind controls (see TimeShiftProvider). */
// eslint-disable-next-line react/only-export-components
export function useTimeShift(): TimeShiftValue {
  const value = useContext(TimeShiftContext)
  if (!value) throw new Error('useTimeShift needs a ShipProvider')
  return value
}
