import routeJson from '../config/route.json'
import terminalsJson from '../config/terminals.json'
import type { ShipRow } from '../types/feed'
import type { LatLon, Route, Terminal, TerminalId } from '../types/route'
import type { Direction, Sailing } from '../types/sailing'
import { bearingDeg, cumulativeM, distanceM, pointAlong, projectOnLine } from './geo'
import { recentRows } from './recent'

export const ROUTE = routeJson as Route
const TERMINALS = terminalsJson as Terminal[]
const CUMULATIVE = cumulativeM(ROUTE.points)
export const ROUTE_LENGTH_M = CUMULATIVE[CUMULATIVE.length - 1]

const terminal = (id: TerminalId) => TERMINALS.find((t) => t.id === id)!
const SWB = terminal('SWB')
const TSA = terminal('TSA')

const KN_TO_KMH = 1.852
const DOCKED_MAX_KN = 1
/** Below this average speed (speeding up after leaving, slowing to arrive) the ETA uses the service speed */
const ETA_MIN_KN = 12
/** The ETA uses the average speed over this much recent history (ms) */
const ETA_AVERAGE_MS = 5 * 60_000

/** Route fraction (0 at Swartz Bay, 1 at Tsawwassen) and route bearing at a position. */
export function locate(lat: number, lon: number): { fraction: number; routeBearing: number } {
  const p: LatLon = [lat, lon]
  const { alongM, segment } = projectOnLine(p, ROUTE.points, CUMULATIVE)
  return {
    fraction: alongM / ROUTE_LENGTH_M,
    routeBearing: bearingDeg(ROUTE.points[segment], ROUTE.points[segment + 1]),
  }
}

/** The terminal where the ship is docked, or null when it is not docked. */
export function dockedAt(row: ShipRow): Terminal | null {
  if (row.speed_over_ground >= DOCKED_MAX_KN) return null
  const p: LatLon = [row.latitude, row.longitude]
  return TERMINALS.find((t) => distanceM(p, [t.lat, t.lon]) <= t.dockRadiusM) ?? null
}

/** Route points between two fractions, in route order. */
export function routeBetween(fromFraction: number, toFraction: number): LatLon[] {
  const a = Math.min(fromFraction, toFraction) * ROUTE_LENGTH_M
  const b = Math.max(fromFraction, toFraction) * ROUTE_LENGTH_M
  const inner = ROUTE.points.filter((_, i) => CUMULATIVE[i] > a && CUMULATIVE[i] < b)
  return [pointAlong(ROUTE.points, CUMULATIVE, a), ...inner, pointAlong(ROUTE.points, CUMULATIVE, b)]
}

/** The point at a route fraction. */
export const pointAt = (fraction: number): LatLon => pointAlong(ROUTE.points, CUMULATIVE, fraction * ROUTE_LENGTH_M)

/** Zone id for a route fraction. */
export function zoneAt(fraction: number): string {
  return (ROUTE.zones.find((z) => fraction <= z.to) ?? ROUTE.zones[ROUTE.zones.length - 1]).id
}

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

/** Calculate the sailing state from the latest row and the recent history. `now` (ms) dates the arrival time. */
export function deriveSailing(row: ShipRow, history: ShipRow[], now = Date.now()): Sailing {
  const docked = dockedAt(row)
  const { fraction, routeBearing } = locate(row.latitude, row.longitude)

  // Docked: the next crossing goes to the other terminal.
  // Sailing: the ship goes toward Tsawwassen when its course is near the route bearing.
  const direction: Direction = docked
    ? docked.id === 'SWB' ? 1 : -1
    : angleDiff(row.ship_course, routeBearing) < 90 ? 1 : -1

  const progress = docked ? 0 : direction === 1 ? fraction : 1 - fraction
  const totalKm = ROUTE_LENGTH_M / 1000
  const doneKm = progress * totalKm
  const remainingKm = totalKm - doneKm

  let etaMin: number | null = null
  if (!docked) {
    const recent = recentRows(history, ETA_AVERAGE_MS)
    const avgKn = recent.reduce((sum, r) => sum + r.speed_over_ground, 0) / Math.max(1, recent.length)
    const kn = avgKn >= ETA_MIN_KN ? avgKn : ROUTE.serviceSpeedKn
    etaMin = Math.round((remainingKm / (kn * KN_TO_KMH)) * 60)
  }

  return {
    status: docked ? 'docked' : 'sailing',
    direction,
    fraction,
    progress,
    from: direction === 1 ? SWB : TSA,
    to: direction === 1 ? TSA : SWB,
    doneKm,
    totalKm,
    remainingKm,
    etaMin,
    arrivalAt: etaMin === null ? null : new Date(now + etaMin * 60_000),
    zoneId: docked ? (docked.id === 'SWB' ? ROUTE.zones[0].id : ROUTE.zones[ROUTE.zones.length - 1].id) : zoneAt(fraction),
  }
}
