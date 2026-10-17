import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getLatestRow } from '../api/shipFeed'
import { FEED_POLL_MS } from '../config/env'
import type { ShipRow } from '../types/feed'
import type { Sailing } from '../types/sailing'
import { deriveSailing } from './sailing'

export interface ShipState {
  row: ShipRow
  /** Rows of the last 90 minutes, oldest first. A crossing is about 80 minutes. */
  history: ShipRow[]
  sailing: Sailing
}

const HISTORY_ROWS = (90 * 60 * 1000) / FEED_POLL_MS

const ShipContext = createContext<ShipState | null>(null)

/** Polls the ship feed and gives the latest row, the history and the sailing state. */
export function ShipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ShipState | null>(null)

  useEffect(() => {
    let live = true
    let history: ShipRow[] = []
    const poll = async () => {
      try {
        const row = await getLatestRow()
        if (!live) return
        history = [...history.slice(1 - HISTORY_ROWS), row]
        setState({ row, history, sailing: deriveSailing(row, history) })
      } catch (err) {
        console.error(err)
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
