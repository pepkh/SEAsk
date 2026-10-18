import { useEffect, useState } from 'react'
import { loadSnapshot } from '../api/bridge'
import { getJson } from '../api/http'
import { BRIDGE_DATE } from '../config/env'
import { getHistory, getLatestRow } from '../api/shipFeed'
import { locate, zoneAt } from '../ship/sailing'
import type { ShipRow } from '../types/feed'
import type { DataSource } from '../types/source'
import type { ClimatologyWire, CurrentsWire, FoulingWire, OceanWire, StationsWire, TidesWire, WeatherWire, WindObsWire } from '../types/bridge'
import type { RouteProfile } from '../types/profile'
import { decodeClimatology, decodeCurrents, decodeFouling, decodeOcean, decodeStations, decodeTides, decodeWeather, decodeWindObs } from './decode'
import { SHIP_KEYS, type Crossing, type DayData, type PartName, type PartStatus, type ShipDay, type ShipKey } from './model'
import { localDate } from './time'
import { emptyDay, PART_NAMES, type DayState } from './useDayData'

/* LIVE mode: the same DayData as a replayed day, filled from the live endpoints as the day goes on. */

const STEP_MS = 60_000
const SHIP_POLL_MS = 1000
const ZONES = ['swartz-bay', 'swanson-channel', 'active-pass', 'strait-of-georgia', 'tsawwassen']
/**
 * Under way above this speed (knots). A finished run counts as a crossing from MIN_RUN minutes (shorter
 * ones are manoeuvres at the berth); the run still going counts from LIVE_MIN_RUN, so a crossing shows
 * as soon as the ferry has left. Gaps in the feed up to MAX_GAP minutes do not split a run.
 */
const UNDERWAY_KN = 5
const MIN_RUN = 10
const LIVE_MIN_RUN = 2
const MAX_GAP = 3

/** Other live parts and how often they change. */
const POLLS: { name: PartName; path: string; everyMs: number; apply: (day: DayData, w: unknown) => void }[] = [
  { name: 'tides', path: '/api/bridge/tides', everyMs: 30 * 60_000, apply: (d, w) => (d.tides = decodeTides(w as TidesWire)) },
  { name: 'weather', path: '/api/bridge/weather', everyMs: 15 * 60_000, apply: (d, w) => (d.weather = decodeWeather(w as WeatherWire)) },
  { name: 'stations', path: '/api/bridge/stations', everyMs: 60_000, apply: (d, w) => (d.stations = decodeStations(w as StationsWire)) },
  { name: 'currents', path: '/api/bridge/currents', everyMs: 10 * 60_000, apply: (d, w) => (d.currents = decodeCurrents(w as CurrentsWire)) },
  { name: 'ocean', path: '/api/bridge/ocean', everyMs: 30 * 60_000, apply: (d, w) => (d.ocean = decodeOcean(w as OceanWire)) },
  { name: 'windobs', path: '/api/bridge/windobs', everyMs: 5 * 60_000, apply: (d, w) => (d.windobs = decodeWindObs(w as WindObsWire)) },
  { name: 'profile', path: '/route/profile', everyMs: 24 * 3_600_000, apply: (d, w) => (d.profile = w as RouteProfile) },
  { name: 'climatology', path: '/route/climatology?window=aug', everyMs: 24 * 3_600_000, apply: (d, w) => (d.climatology = decodeClimatology(w as ClimatologyWire)) },
]

const NOT_LIVE: Partial<Record<PartName, string>> = {
  traffic: 'replay only (ONC publishes AIS as daily files)',
  profiles: 'replay only',
  sources: 'replay only',
  stats: 'replay only',
}

function emptyShip(day: DayData): ShipDay {
  const n = Math.round((day.dayEnd - day.dayStart) / STEP_MS)
  return {
    axis: { t0: day.dayStart, stepMs: STEP_MS, n },
    c: Object.fromEntries(SHIP_KEYS.map((k) => [k, new Float32Array(n).fill(NaN)])) as Record<ShipKey, Float32Array>,
    zones: ZONES,
    comfortLevels: ['calm', 'gentle', 'rolly'],
    crossings: [],
  }
}

/** Puts a live row into its minute slot (the newest row of the minute wins). */
function write(ship: ShipDay, row: ShipRow, tail: number[]) {
  const t = Date.parse(row.time)
  const i = Math.floor((t - ship.axis.t0) / STEP_MS)
  if (i < 0 || i >= ship.axis.n) return
  const set = (k: ShipKey, v: number | null | undefined) => {
    ship.c[k][i] = v === null || v === undefined ? NaN : v
  }
  set('lat', row.latitude)
  set('lon', row.longitude)
  set('sogKn', row.speed_over_ground)
  set('cogDeg', row.ship_course)
  set('hdgDeg', row.heading ?? null)
  set('rollDeg', row.roll)
  set('airC', row.air_temperature)
  set('baroHpa', row.barometric_pressure)
  set('sstC', row.tsg_temperature)
  set('sal', row.salinity)
  set('o2Sat', row.oxygen_saturation)
  set('chl', row.chlorophyll)
  set('turb', row.turbidity)
  set('cdom', row.cdom_fluorescence)
  // The live feed already drops ONC QC-bad values: a value present is good, a missing one is unknown.
  set('tsgFlag', row.salinity !== null ? 1 : null)
  set('oxyFlag', row.oxygen_saturation !== null ? 1 : null)
  set('opticsFlag', row.chlorophyll !== null ? 1 : null)
  if (Number.isFinite(row.latitude) && Number.isFinite(row.longitude)) {
    const frac = locate(row.latitude, row.longitude).fraction
    set('frac', frac)
    set('zone', ZONES.indexOf(zoneAt(frac)))
  }
  // Roll over the last minute (1 Hz rows) gives the ride comfort, as in ship/comfort.ts.
  if (row.roll !== null) tail.push(row.roll)
  if (tail.length > 60) tail.splice(0, tail.length - 60)
  if (tail.length >= 10) {
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length
    const std = Math.sqrt(tail.reduce((a, b) => a + (b - mean) ** 2, 0) / (tail.length - 1))
    set('rollStd', std)
    set('comfort', std < 0.5 ? 0 : std < 1 ? 1 : 2)
  }
}

/**
 * Crossings from the minutes under way. The one still going ends at Infinity. The direction comes from
 * the terminal it left (route fraction at departure), which is known from the first minute.
 */
function crossingsOf(ship: ShipDay, now: number): Crossing[] {
  const { c, axis } = ship
  const out: Crossing[] = []
  const last = Math.min(axis.n - 1, Math.floor((now - axis.t0) / STEP_MS))
  let start = -1
  let lastMoving = -1
  let lastSeen = -1
  const close = (end: number, ongoing: boolean) => {
    if (end - start + 1 >= (ongoing ? LIVE_MIN_RUN : MIN_RUN)) {
      // Fraction at departure: the first known one in the run.
      let f0 = NaN
      for (let k = start; k <= end && !Number.isFinite(f0); k++) f0 = c.frac[k]
      out.push({
        id: out.length + 1,
        direction: Number.isFinite(f0) && f0 > 0.5 ? 'tsa_to_swb' : 'swb_to_tsa',
        start: axis.t0 + start * STEP_MS,
        end: ongoing ? Infinity : axis.t0 + end * STEP_MS,
      })
    }
    start = -1
  }
  for (let i = 0; i <= last; i++) {
    const sog = c.sogKn[i]
    if (!Number.isFinite(sog)) {
      // A gap: a run survives it if the feed comes back within MAX_GAP minutes.
      if (start >= 0 && i - lastSeen > MAX_GAP) close(lastMoving, false)
      continue
    }
    lastSeen = i
    if (sog > UNDERWAY_KN) {
      if (start < 0) start = i
      lastMoving = i
    } else if (start >= 0) {
      close(lastMoving, false)
    }
  }
  if (start >= 0) close(lastMoving, last - lastSeen <= MAX_GAP)
  return out
}

/**
 * Today, live: the ship from the kiosk's feed (backfilled, then every second), plus the live tides,
 * weather, observatories and surface currents. AIS traffic is replay only.
 */
export function useLiveDay(enabled: boolean): DayState {
  const [state, setState] = useState<DayState>(() => {
    const day = emptyDay(localDate(Date.now()))
    return { day, status: Object.fromEntries(PART_NAMES.map((n) => [n, { state: 'loading' }])) as DayState['status'], version: 0 }
  })

  useEffect(() => {
    if (!enabled) return
    let live = true
    const day = emptyDay(localDate(Date.now()))
    const ship = emptyShip(day)
    day.ship = ship
    const tail: number[] = []
    const status = Object.fromEntries(
      PART_NAMES.map((n) => [n, NOT_LIVE[n] ? { state: 'missing', reason: NOT_LIVE[n]! } : { state: 'loading' }]),
    ) as Record<PartName, PartStatus>
    const publish = () => live && setState((s) => ({ day, status: { ...status }, version: s.version + 1 }))
    const timers: number[] = []

    // Ship: the kiosk's own feed (api/shipFeed.ts), so the bridge and the passenger screens always show the
    // same ship: the live ONC feed with VITE_LIVE_DATA, else (or while it is down) the sample feed, which
    // both work out from the clock. The past comes the same way (up to 180 min, the API's limit).
    let source: DataSource | null = null
    const backfill = (expected: DataSource) =>
      getHistory(Math.min(180, Math.ceil((Date.now() - day.dayStart) / 60_000)))
        .then((h) => {
          if (h.source !== expected || source !== expected) return
          h.rows.forEach((r) => write(ship, r, []))
          ship.crossings = crossingsOf(ship, Date.now())
          publish()
        })
        .catch((err) => console.warn('Bridge live: no ship history', err))
    let busy = false
    let lastOk = 0
    const pollShip = async () => {
      if (busy) return
      busy = true
      try {
        const next = await getLatestRow()
        // Live and sample positions differ: a new source starts the day's track afresh (no jump).
        if (next.source !== source) {
          for (const col of Object.values(ship.c)) col.fill(NaN)
          tail.length = 0
          source = next.source
          backfill(next.source)
        }
        write(ship, next.row, tail)
        lastOk = Date.now()
        ship.crossings = crossingsOf(ship, Date.now())
        const ageS = next.source === 'live' ? Math.max(0, (Date.now() - Date.parse(next.row.time)) / 1000) : 0
        status.ship = { state: 'ready', source: next.source, ageS }
      } catch {
        // Keep the data; the header shows how old it is.
        status.ship = lastOk && source
          ? { state: 'ready', source, ageS: (Date.now() - lastOk) / 1000 }
          : { state: 'missing', reason: 'ship feed down' }
      } finally {
        busy = false
        publish()
      }
    }
    pollShip()
    timers.push(window.setInterval(pollShip, SHIP_POLL_MS))

    // Wind at the ship from OpenWeatherMap (the kiosk's /api/weather): a second source for when the
    // Open-Meteo grid is down. Every 5 minutes, at the ship's newest position.
    const pollPoint = () => {
      const n = Math.floor((Date.now() - ship.axis.t0) / STEP_MS)
      const lat = ship.c.lat[n] ?? NaN
      const lon = ship.c.lon[n] ?? NaN
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
      getJson<{ observedAt?: string; wind?: { kn: number; fromDeg: number; gustKn?: number | null }; visibilityKm?: number | null }>(
        `/api/weather?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`,
        10_000,
      )
        .then((w) => {
          if (!w.wind) return
          day.pointWeather = {
            t: w.observedAt ? Date.parse(w.observedAt) : Date.now(),
            windKn: w.wind.kn,
            fromDeg: w.wind.fromDeg,
            gustKn: w.wind.gustKn ?? null,
            visKm: w.visibilityKm ?? null,
          }
          publish()
        })
        .catch(() => undefined)
    }
    timers.push(window.setTimeout(pollPoint, 3000))
    timers.push(window.setInterval(pollPoint, 5 * 60_000))

    // Biofouling: the model has one run (the replay day); shown live too, labelled with its own date.
    loadSnapshot<FoulingWire>(BRIDGE_DATE, 'fouling')
      .then((w) => {
        day.fouling = decodeFouling(w)
        status.fouling = { state: 'ready', source: 'snapshot' }
      })
      .catch(() => (status.fouling = { state: 'missing', reason: `no model run for ${BRIDGE_DATE}` }))
      .finally(publish)

    for (const p of POLLS) {
      const run = () =>
        getJson<unknown>(p.path, 20_000)
          .then((w) => {
            p.apply(day, w)
            status[p.name] = { state: 'ready', source: 'live' }
          })
          .catch(() => {
            if (status[p.name].state !== 'ready') status[p.name] = { state: 'missing', reason: 'not available live' }
          })
          .finally(publish)
      run()
      timers.push(window.setInterval(run, p.everyMs))
    }

    return () => {
      live = false
      timers.forEach((id) => {
        window.clearInterval(id)
        window.clearTimeout(id)
      })
    }
  }, [enabled])

  return state
}
