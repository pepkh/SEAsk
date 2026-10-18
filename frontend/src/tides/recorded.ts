import { currentNow } from '../bridge/derive/tide'
import type { Tides } from '../bridge/model'
import { hhmmOf as hhmm } from '../i18n/format'
import { distanceM } from '../ship/geo'
import type { LatLon } from '../types/route'
import type { TidesResponse } from '../types/tides'

/**
 * The recorded day's DFO predictions (the bridge's tides file) in the shape of a live GET /api/tides answer: the
 * tide station nearest `at`, and the Active Pass current at `time` (epoch ms). The file covers the local day from
 * midnight, like the live answer.
 */
export function recordedTides(tides: Tides, at: LatLon, time: number): TidesResponse | null {
  let station = tides.stations[0]
  for (const s of tides.stations) if (distanceM(at, [s.lat, s.lon]) < distanceM(at, [station.lat, station.lon])) station = s
  if (!station) return null
  const c = tides.current
  const now = c && currentNow(tides, c, time)
  const peak = (type: 'flood' | 'ebb') => Math.max(0, ...(c?.events.filter((e) => e.type === type).map((e) => e.kn) ?? [])) || null
  return {
    station: { code: station.code, name: station.name },
    date: new Date(tides.axis.t0).toLocaleDateString('en-CA'),
    stepMin: tides.axis.stepMs / 60_000,
    heights: Array.from(station.h),
    extremes: station.extremes.map((e) => ({ type: e.type, h: e.h, at: hhmm(e.t) })),
    current:
      c && now && Number.isFinite(now.kn)
        ? {
            station: c.station,
            speedKn: now.kn,
            towardDeg: now.towardDeg,
            flooding: now.flooding ?? false,
            maxFloodKn: peak('flood'),
            maxEbbKn: peak('ebb'),
            nextSlack: now.nextSlack === null ? null : hhmm(now.nextSlack),
            events: c.events.map((e) => ({ type: e.type, at: hhmm(e.t), kn: e.kn })),
          }
        : null,
  }
}
