import { createContext } from 'react'
import type { ShipRow } from '../types/feed'
import type { Sailing } from '../types/sailing'
import type { DataSource } from '../types/source'

export interface ShipState {
  row: ShipRow
  /** Rows of the last 90 minutes, oldest first. A crossing is about 80 minutes. */
  history: ShipRow[]
  sailing: Sailing
  /** Live feed, or the sample feed while the live one is down */
  source: DataSource
}

export type ReplaySpeed = 1 | 4 | 10

export interface TimeShiftValue {
  /** The moment shown (ms), or null when the kiosk shows now */
  at: number | null
  playing: boolean
  speed: ReplaySpeed
  /** How far behind now the shown moment is (ms); 0 when live */
  behindMs: number
  /** Goes up on every jump (rewind or go live), so the map can start its ship track afresh */
  jump: number
  /** Show the moment `at` (ms) and play on from there */
  rewindTo: (at: number) => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: ReplaySpeed) => void
  goLive: () => void
}

/** The newest state from the feed */
export const LiveShipContext = createContext<ShipState | null>(null)
/** What the screens show: the live state, or the rewound moment */
export const ShownShipContext = createContext<ShipState | null>(null)
export const TimeShiftContext = createContext<TimeShiftValue | null>(null)
