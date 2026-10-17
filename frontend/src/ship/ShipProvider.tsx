import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getLatestRow } from '../api/shipFeed'
import { FEED_POLL_MS } from '../config/env'
import type { ShipRow } from '../types/feed'
import type { Sailing } from '../types/sailing'
import type { DataSource } from '../types/source'
import { deriveSailing } from './sailing'

export interface ShipState {
  row: ShipRow
  /** Rows of the last 90 minutes, oldest first. A crossing is about 80 minutes. */
  history: ShipRow[]
  sailing: Sailing
  /** Live feed, or the sample feed while the live one is down */
  source: DataSource
}

const HISTORY_ROWS = (90 * 60 * 1000) / FEED_POLL_MS

const ShipContext = createContext<ShipState | null>(null)

/** Polls the ship feed and gives the latest row, the history and the sailing state. */
export function ShipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ShipState | null>(null)

  useEffect(() => {
    let live = true
    let busy = false
    let history: ShipRow[] = []
    let source: DataSource | undefined
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
        history = [...history.slice(1 - HISTORY_ROWS), next.row]
        setState({ row: next.row, history, sailing: deriveSailing(next.row, history), source: next.source })
      } catch (err) {
        console.error(err)
      } finally {
        busy = false
      }
    }
    poll()
    const id = setInterval(poll, FEED_POLL_MS)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [])

  return <ShipContext value={state}>{children}</ShipContext>
}

/** The ship state, or null until the first row arrives. */
// eslint-disable-next-line react/only-export-components
export const useShip = () => useContext(ShipContext)
