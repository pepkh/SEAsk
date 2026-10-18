import { binAt } from '../ship/profile'
import { ROUTE, ROUTE_LENGTH_M } from '../ship/sailing'
import type { ClimateVar, StationSeriesKey } from '../types/bridge'
import type { ProfileValue } from '../types/profile'
import { tendency, type BaroTendency } from './derive/baro'
import { cpaOf, isDanger, type Cpa } from './derive/cpa'
import { sunTimes, type SunTimes } from './derive/sun'
import { currentNow, tideNow, type CurrentNow, type TideNow } from './derive/tide'
import { currentSampler, marineAt, weatherAt, windSourceSampler, windStationsAt, type CurrentSource, type WindSource } from './field'
import type { Crossing, DayData, ShipKey, Station } from './model'
import { angleAt, extent, lastAt, valueAt, windowStat } from './series'
import { vesselAt, type VesselNow } from './traffic'

/* Everything the bridge shows for one moment: a pure function of the day's data and the time. */

export type WaterKey = 'sstC' | 'sal' | 'o2Sat' | 'chl' | 'turb'
export const WATER_KEYS: WaterKey[] = ['sstC', 'sal', 'o2Sat', 'chl', 'turb']

const PROFILE_OF: Record<WaterKey, ProfileValue> = { sstC: 'sst', sal: 'salinity', o2Sat: 'o2_sat', chl: 'chl', turb: 'turbidity' }
/**
 * Readings with a trustworthy multi-year baseline. The ferry's fluorometer (chlorophyll, turbidity)
 * had calibration gaps and biofouling in past Augusts, so those compare with today's crossings instead.
 */
const CLIMATE_OF: Partial<Record<WaterKey, ClimateVar>> = { sstC: 'sst', sal: 'sal', o2Sat: 'o2Sat' }
const FLAG_OF: Record<WaterKey, ShipKey> = { sstC: 'tsgFlag', sal: 'tsgFlag', o2Sat: 'oxyFlag', chl: 'opticsFlag', turb: 'opticsFlag' }

export interface WaterReading {
  now: number
  /** Typical value at this point of the route (NaN when unknown) */
  usual: number
  /** 10th and 90th percentile of past Augusts (climatology only) */
  p10: number
  p90: number
  usualFrom: 'climatology' | 'today' | null
  /** ONC QC flag: 1 good, 3 probably bad, 4 bad (pump off) */
  flag: number
}

export interface OwnShip {
  lat: number
  lon: number
  sogKn: number
  cogDeg: number
  hdgDeg: number
  rollDeg: number
  rollStd: number
  heaveM: number
  comfort: string | null
  airC: number
  baroHpa: number
  baro: BaroTendency | null
  water: Record<WaterKey, WaterReading>
  /** 0 at Swartz Bay, 1 at Tsawwassen */
  frac: number
  zone: string | null
  crossing: Crossing | null
  /** Share of the current crossing done, 0..1 */
  progress: number | null
  eta: number | null
  /** At a berth: the terminal; otherwise null */
  berth: 'swartz-bay' | 'tsawwassen' | null
  nextDeparture: Crossing | null
}

export interface DeepWater {
  code: string
  name: string
  depthM: number | null
  v: Partial<Record<StationSeriesKey, number>>
}

export interface TargetNow extends VesselNow {
  cpa: Cpa
  danger: boolean
}

export interface Snapshot {
  t: number
  ship: OwnShip | null
  tides: TideNow[]
  current: CurrentNow | null
  wind: {
    /**
     * At the ship, blended like the currents: measured near an Environment Canada station, the model
     * elsewhere (live: OpenWeatherMap at the ship while the model grid is down)
     */
    atShip: { kn: number; fromDeg: number; gustKn: number; source: WindSource } | null
    /** The nearest station with a reading now */
    nearest: { name: string; distKm: number; kn: number; fromDeg: number; gustKn: number } | null
    /** Measured at Iona (ONC) */
    iona: { kn: number; fromDeg: number; gustKn: number } | null
    /** The Iona anemometer read about zero all day (stuck cups): prefer the model */
    ionaSuspect: boolean
  }
  sea: { waveM: number; wavePeriodS: number; waveFromDeg: number; visKm: number; cloudPct: number; precipMm: number; modelSstC: number }
  /** Radar where it measured, else the finest model with a value (and which one) */
  surfaceCurrent: { kn: number; towardDeg: number; source: CurrentSource } | null
  deep: DeepWater[]
  twdp: { lat: number; lon: number; hdgDeg: number; sogKn: number; sstC: number; sal: number; o2Sat: number; chl: number; turb: number } | null
  targets: TargetNow[]
  sun: SunTimes
}

const SWARTZ_BAY: [number, number] = ROUTE.points[0] as [number, number]
const KN = 1852 / 3600

function ownShip(day: DayData, t: number): OwnShip | null {
  const ship = day.ship
  if (!ship) return null
  const { axis, c } = ship
  const at = (k: ShipKey) => valueAt(axis, c[k], t)
  const lat = at('lat')
  const lon = at('lon')
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const frac = at('frac')
  const nearest = (k: ShipKey) => {
    const i = Math.round((t - axis.t0) / axis.stepMs)
    return i >= 0 && i < axis.n ? c[k][i] : NaN
  }
  const comfortIdx = nearest('comfort')
  const zoneIdx = nearest('zone')
  const crossing = ship.crossings.find((x) => x.start <= t && t <= x.end) ?? null
  const sogKn = at('sogKn')

  let progress: number | null = null
  let eta: number | null = null
  if (crossing && Number.isFinite(frac)) {
    progress = crossing.direction === 'swb_to_tsa' ? frac : 1 - frac
    const mean = windowStat(axis, c.sogKn, t - 5 * 60_000, t, 'mean')
    // Leaving or nearing the berth the 5-minute mean is low and would push the ETA hours out.
    const speedKn = Number.isFinite(mean) && mean >= 12 ? mean : ROUTE.serviceSpeedKn
    eta = t + (((1 - progress) * ROUTE_LENGTH_M) / (speedKn * KN)) * 1000
  }
  const berth = !crossing && Number.isFinite(frac) && sogKn < 2 ? (frac < 0.5 ? 'swartz-bay' : 'tsawwassen') : null

  const bin = Number.isFinite(frac) ? binAt(day.profile, frac) : null
  const climBin = Number.isFinite(frac) && day.climatology ? Math.min(day.climatology.nBins - 1, Math.max(0, Math.floor(frac * day.climatology.nBins))) : -1
  const water = Object.fromEntries(
    (['sstC', 'sal', 'o2Sat', 'chl', 'turb'] as WaterKey[]).map((k) => {
      const climVar = CLIMATE_OF[k]
      const clim = climBin >= 0 && climVar ? day.climatology?.vars[climVar] : undefined
      const climMean = clim ? clim.mean[climBin] : NaN
      const today = bin?.[PROFILE_OF[k]] ?? null
      const reading: WaterReading = {
        now: at(k),
        usual: Number.isFinite(climMean) ? climMean : today ?? NaN,
        p10: clim ? clim.p10[climBin] : NaN,
        p90: clim ? clim.p90[climBin] : NaN,
        usualFrom: Number.isFinite(climMean) ? 'climatology' : today !== null ? 'today' : null,
        flag: nearest(FLAG_OF[k]),
      }
      return [k, reading]
    }),
  ) as Record<WaterKey, WaterReading>

  const baroNow = windowStat(axis, c.baroHpa, t - 5 * 60_000, t, 'mean')
  const baroThen = windowStat(axis, c.baroHpa, t - 3 * 3_600_000 - 5 * 60_000, t - 3 * 3_600_000, 'mean')

  return {
    lat,
    lon,
    sogKn,
    cogDeg: angleAt(axis, c.cogDeg, t),
    hdgDeg: angleAt(axis, c.hdgDeg, t),
    rollDeg: at('rollDeg'),
    rollStd: at('rollStd'),
    heaveM: at('heaveM'),
    comfort: Number.isFinite(comfortIdx) ? ship.comfortLevels[comfortIdx] ?? null : null,
    airC: at('airC'),
    baroHpa: at('baroHpa'),
    baro: t - 3 * 3_600_000 >= axis.t0 ? tendency(baroNow, baroThen) : null,
    water,
    frac,
    zone: Number.isFinite(zoneIdx) ? ship.zones[zoneIdx] ?? null : null,
    crossing,
    progress,
    eta,
    berth,
    nextDeparture: ship.crossings.find((x) => x.start > t) ?? null,
  }
}

function stationValues(s: Station, day: DayData, t: number): DeepWater {
  const axis = day.stations!.axis
  const v: DeepWater['v'] = {}
  for (const [k, col] of Object.entries(s.s) as [StationSeriesKey, Float32Array][]) {
    // The newest value within 30 min: observatory series have short gaps.
    const last = lastAt(axis, col, t, 30 * 60_000)
    if (last) v[k] = last.value
  }
  return { code: s.code, name: s.name, depthM: s.depthM, v }
}

/** True when the Iona wind speed never passes 1.5 kn all day (the cups were stuck on 2026-08-17). */
function ionaStuck(iona: Station | undefined): boolean {
  const kn = iona?.s.windKn
  if (!kn) return false
  const [, max] = extent(kn)
  return Number.isFinite(max) && max < 1.5
}

/** Everything at time `t`. */
export function snapshotAt(day: DayData, t: number): Snapshot {
  const ship = ownShip(day, t)
  const [lat, lon] = ship ? [ship.lat, ship.lon] : SWARTZ_BAY

  const tides = day.tides ? day.tides.stations.map((s) => tideNow(day.tides!, s, t)) : []
  const current = day.tides?.current ? currentNow(day.tides, day.tides.current, t) : null

  const w = day.weather
  const blended = windSourceSampler(day, t)?.(lat, lon) ?? null
  const near = windStationsAt(day, t, lat, lon)[0] ?? null
  const modelGust = w ? weatherAt(w, 'gustKn', t, lat, lon) : NaN
  // Live fallback: OpenWeatherMap at the ship, used only when it is recent (15 min) and near `t`.
  const point = day.pointWeather && Math.abs(t - day.pointWeather.t) < 15 * 60_000 ? day.pointWeather : null

  const stations = day.stations
  const iona = stations?.stations.find((s) => s.code === 'IONA')
  const ionaV = iona ? stationValues(iona, day, t).v : null

  const twdp = stations?.twdp
  const tw = (k: keyof NonNullable<typeof twdp>['c']) => (twdp?.c[k] ? valueAt(twdp.axis, twdp.c[k]!, t) : NaN)
  const twdpLat = tw('lat')

  const surface = currentSampler(day, t)?.(lat, lon) ?? null

  const targets: TargetNow[] = []
  if (day.traffic && ship) {
    for (const v of day.traffic.vessels) {
      if (v.role === 'own') continue
      const now = vesselAt(v, t)
      if (!now) continue
      const cpa = cpaOf(
        { lat: ship.lat, lon: ship.lon, sogKn: ship.sogKn, cogDeg: ship.cogDeg },
        { lat: now.lat, lon: now.lon, sogKn: now.sogKn, cogDeg: now.cogDeg },
      )
      targets.push({ ...now, cpa, danger: !now.stale && isDanger(cpa) })
    }
    targets.sort((a, b) => a.cpa.rangeNm - b.cpa.rangeNm)
  }

  return {
    t,
    ship,
    tides,
    current,
    wind: {
      atShip: blended
        ? {
            kn: Math.hypot(blended.uv[0], blended.uv[1]),
            fromDeg: Math.hypot(blended.uv[0], blended.uv[1]) > 0.2 ? ((Math.atan2(-blended.uv[0], -blended.uv[1]) * 180) / Math.PI + 360) % 360 : NaN,
            // A measured wind takes the station's gust only (hourly records have none): never the model's.
            gustKn: blended.source.kind === 'measured' ? (near?.gustKn ?? NaN) : modelGust,
            source: blended.source,
          }
        : point
          ? { kn: point.windKn, fromDeg: point.fromDeg, gustKn: point.gustKn ?? NaN, source: { kind: 'model', label: 'OpenWeatherMap' } }
          : null,
      nearest: near ? { name: near.station.name, distKm: near.distKm, kn: near.kn, fromDeg: near.fromDeg, gustKn: near.gustKn } : null,
      iona:
        ionaV && Number.isFinite(ionaV.windKn ?? NaN)
          ? { kn: ionaV.windKn!, fromDeg: ionaV.windFromDeg ?? NaN, gustKn: ionaV.gustKn ?? NaN }
          : null,
      ionaSuspect: ionaStuck(iona),
    },
    sea: {
      waveM: w ? marineAt(w, 'waveM', t, lat, lon) : NaN,
      wavePeriodS: w ? marineAt(w, 'wavePeriodS', t, lat, lon) : NaN,
      waveFromDeg: w ? marineAt(w, 'waveFromDeg', t, lat, lon) : NaN,
      visKm: w && Number.isFinite(weatherAt(w, 'visKm', t, lat, lon)) ? weatherAt(w, 'visKm', t, lat, lon) : point?.visKm ?? NaN,
      cloudPct: w ? weatherAt(w, 'cloudPct', t, lat, lon) : NaN,
      precipMm: w ? weatherAt(w, 'precipMm', t, lat, lon) : NaN,
      modelSstC: w ? marineAt(w, 'sstC', t, lat, lon) : NaN,
    },
    surfaceCurrent: surface
      ? {
          kn: Math.hypot(surface.uv[0], surface.uv[1]) / KN,
          towardDeg: ((Math.atan2(surface.uv[0], surface.uv[1]) * 180) / Math.PI + 360) % 360,
          source: surface.source,
        }
      : null,
    deep: stations ? stations.stations.filter((s) => s.kind === 'node').map((s) => stationValues(s, day, t)) : [],
    twdp:
      twdp && Number.isFinite(twdpLat)
        ? {
            lat: twdpLat,
            lon: tw('lon'),
            hdgDeg: twdp.c.hdgDeg ? angleAt(twdp.axis, twdp.c.hdgDeg, t) : NaN,
            sogKn: tw('sogKn'),
            sstC: tw('sstC'),
            sal: tw('sal'),
            o2Sat: tw('o2Sat'),
            chl: tw('chl'),
            turb: tw('turb'),
          }
        : null,
    targets,
    sun: sunTimes(day.dayStart, lat, lon),
  }
}
