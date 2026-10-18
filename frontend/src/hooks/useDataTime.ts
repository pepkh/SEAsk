import { useShip } from '../ship/ShipProvider'
import type { DataSource } from '../types/source'
import { useClock } from './useClock'

/**
 * The moment to show data from `source` at. Live data: the clock. The recorded day (sample): the time the shown ship
 * row was really recorded, so the tides and the weather match the ship (the rewound moment while rewinding). The
 * clock until the first row arrives.
 */
export function useDataTime(source: DataSource = 'sample'): Date {
  const ship = useShip()
  const now = useClock()
  if (source === 'live' || !ship?.row.recorded_time) return now
  return new Date(ship.row.recorded_time)
}
