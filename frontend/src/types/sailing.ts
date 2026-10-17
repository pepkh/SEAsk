import type { Terminal } from './route'

/** 1 = Swartz Bay → Tsawwassen. -1 = Tsawwassen → Swartz Bay. */
export type Direction = 1 | -1

/** The sailing state that the kiosk calculates from one feed row. */
export interface Sailing {
  status: 'sailing' | 'docked'
  direction: Direction
  /** Position on the route: 0 at Swartz Bay, 1 at Tsawwassen */
  fraction: number
  /** Part of the crossing that is done: 0 at departure, 1 at arrival */
  progress: number
  from: Terminal
  to: Terminal
  doneKm: number
  totalKm: number
  remainingKm: number
  /** null when the ship is docked */
  etaMin: number | null
  arrivalAt: Date | null
  zoneId: string
}
