import { useEffect, useState } from 'react'
import { loadPart } from '../api/bridge'
import { BUNDLED_PROFILE } from '../ship/profile'
import type {
  ClimatologyWire, CrossingStats, CurrentsWire, OceanWire, ProfilesWire, WindObsWire, ShipDayWire, SourcesWire, StationsWire, TidesWire, TrafficWire, WeatherWire,
} from '../types/bridge'
import type { RouteProfile } from '../types/profile'
import { decodeClimatology, decodeCurrents, decodeOcean, decodeProfiles, decodeWindObs, decodeShip, decodeStations, decodeTides, decodeTraffic, decodeWeather } from './decode'
import type { DayData, PartName, PartStatus } from './model'
import { localMidnight } from './time'

/** One loadable part: its API path, its snapshot file name, and how it goes into the day. */
interface PartSpec<W> {
  path: (date: string) => string
  file: string
  apply: (day: DayData, wire: W) => void
}

const spec = <W,>(s: PartSpec<W>) => s as PartSpec<unknown>

const PARTS: Record<PartName, PartSpec<unknown>> = {
  ship: spec<ShipDayWire>({ path: (d) => `/bridge/${d}/ship?step=10`, file: 'ship', apply: (day, w) => (day.ship = decodeShip(w)) }),
  stats: spec<CrossingStats[]>({ path: () => '/trips/stats', file: 'trips-stats', apply: (day, w) => (day.stats = w) }),
  profile: spec<RouteProfile>({ path: () => '/route/profile', file: 'route-profile', apply: (day, w) => (day.profile = w) }),
  climatology: spec<ClimatologyWire>({ path: () => '/route/climatology?window=aug', file: 'climatology', apply: (day, w) => (day.climatology = decodeClimatology(w)) }),
  tides: spec<TidesWire>({ path: (d) => `/bridge/${d}/tides`, file: 'tides', apply: (day, w) => (day.tides = decodeTides(w)) }),
  weather: spec<WeatherWire>({ path: (d) => `/bridge/${d}/weather`, file: 'weather', apply: (day, w) => (day.weather = decodeWeather(w)) }),
  stations: spec<StationsWire>({ path: (d) => `/bridge/${d}/stations`, file: 'stations', apply: (day, w) => (day.stations = decodeStations(w)) }),
  currents: spec<CurrentsWire>({ path: (d) => `/bridge/${d}/currents`, file: 'currents', apply: (day, w) => (day.currents = decodeCurrents(w)) }),
  ocean: spec<OceanWire>({ path: (d) => `/bridge/${d}/ocean`, file: 'ocean', apply: (day, w) => (day.ocean = decodeOcean(w)) }),
  windobs: spec<WindObsWire>({ path: (d) => `/bridge/${d}/windobs`, file: 'windobs', apply: (day, w) => (day.windobs = decodeWindObs(w)) }),
  profiles: spec<ProfilesWire>({ path: (d) => `/bridge/${d}/profiles`, file: 'profiles', apply: (day, w) => (day.profiles = decodeProfiles(w)) }),
  traffic: spec<TrafficWire>({ path: (d) => `/bridge/${d}/traffic?step=60`, file: 'traffic', apply: (day, w) => (day.traffic = decodeTraffic(w)) }),
  sources: spec<SourcesWire>({ path: (d) => `/bridge/${d}/sources`, file: 'sources', apply: (day, w) => (day.sources = w.items) }),
}

export const PART_NAMES = Object.keys(PARTS) as PartName[]

/** Requests are kept per date and part, so a remount (StrictMode, back and forth) does not refetch. */
const requests = new Map<string, ReturnType<typeof loadPart>>()

function request(date: string, name: PartName) {
  const key = `${date}/${name}`
  let r = requests.get(key)
  if (!r) {
    r = loadPart<unknown>(PARTS[name].path(date), PARTS[name].file, date)
    requests.set(key, r)
  }
  return r
}

export interface DayState {
  day: DayData
  status: Record<PartName, PartStatus>
  /** Bumps whenever a part arrives */
  version: number
}

/** A day with no datasets yet (the bundled route profile only). */
export function emptyDay(date: string): DayData {
  const dayStart = localMidnight(date)
  return { date, dayStart, dayEnd: localMidnight(date, 1), profile: BUNDLED_PROFILE }
}

/**
 * Loads every dataset of a recorded day in parallel. Panels fill in as their part arrives; a part
 * that neither the backend nor the offline copy has is "missing" (the route profile falls back to
 * the bundled copy).
 */
export function useDayData(date: string, enabled = true): DayState {
  const [state, setState] = useState<DayState>(() => ({
    day: emptyDay(date),
    status: Object.fromEntries(PART_NAMES.map((n) => [n, { state: 'loading' }])) as DayState['status'],
    version: 0,
  }))

  useEffect(() => {
    if (!enabled) return
    let live = true
    const day = emptyDay(date)
    const status = Object.fromEntries(PART_NAMES.map((n) => [n, { state: 'loading' } as PartStatus])) as DayState['status']

    for (const name of PART_NAMES) {
      request(date, name).then((loaded) => {
        if (!live) return
        if (loaded) {
          try {
            PARTS[name].apply(day, loaded.data)
            status[name] = { state: 'ready', source: loaded.source }
          } catch (err) {
            console.error(`Bridge: could not read ${name}`, err)
            status[name] = { state: 'missing', reason: 'unreadable' }
          }
        } else {
          status[name] = name === 'profile' ? { state: 'ready', source: 'bundled' } : { state: 'missing', reason: 'not available' }
        }
        setState((s) => ({ day, status: { ...status }, version: s.version + 1 }))
      })
    }
    return () => {
      live = false
    }
  }, [date, enabled])

  return state
}
