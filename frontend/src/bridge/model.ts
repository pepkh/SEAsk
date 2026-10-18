import type { AisGroup, ClimateVar, CrossingStats, Direction, SourceItem, StationSeriesKey, TwdpKey } from '../types/bridge'
import type { RouteProfile } from '../types/profile'
import type { Axis } from './series'

/* The decoded bridge day: every dataset on its own regular axis, columns as Float32Array (NaN = missing). */

export type ShipKey =
  | 'lat' | 'lon' | 'sogKn' | 'cogDeg' | 'hdgDeg' | 'rollDeg' | 'rollStd' | 'heaveM' | 'airC' | 'baroHpa'
  | 'sstC' | 'sal' | 'o2Sat' | 'chl' | 'turb' | 'cdom' | 'sigmaT' | 'frac' | 'crossing' | 'zone' | 'comfort'
  | 'tsgFlag' | 'oxyFlag' | 'opticsFlag'

export const SHIP_KEYS: ShipKey[] = [
  'lat', 'lon', 'sogKn', 'cogDeg', 'hdgDeg', 'rollDeg', 'rollStd', 'heaveM', 'airC', 'baroHpa', 'sstC', 'sal', 'o2Sat',
  'chl', 'turb', 'cdom', 'sigmaT', 'frac', 'crossing', 'zone', 'comfort', 'tsgFlag', 'oxyFlag', 'opticsFlag',
]

export interface Crossing {
  id: number
  direction: Direction
  start: number
  end: number
}

export interface ShipDay {
  axis: Axis
  c: Record<ShipKey, Float32Array>
  zones: string[]
  comfortLevels: string[]
  crossings: Crossing[]
}

export interface TideStation {
  code: string
  name: string
  lat: number
  lon: number
  h: Float32Array
  extremes: { type: 'high' | 'low'; h: number; t: number }[]
}

export interface TideCurrent {
  code: string
  station: string
  lat: number
  lon: number
  floodDeg: number | null
  kn: Float32Array
  towardDeg: Float32Array
  signedKn: Float32Array
  events: { type: 'slack' | 'flood' | 'ebb'; t: number; kn: number }[]
}

export interface Tides {
  axis: Axis
  stations: TideStation[]
  current: TideCurrent | null
}

/** A regular lat/lon grid; cell = iy × nLon + ix, iy 0 at the south. */
export interface LatLonGrid {
  lat0: number
  lon0: number
  dLat: number
  dLon: number
  nLat: number
  nLon: number
}

export type AtmKey = 'windKn' | 'windFromDeg' | 'gustKn' | 'pressureHpa' | 'tempC' | 'cloudPct' | 'precipMm' | 'visKm'
export type MarineKey = 'waveM' | 'waveFromDeg' | 'wavePeriodS' | 'sstC' | 'currentKn' | 'currentTowardDeg'

export interface Weather {
  axis: Axis
  grid: LatLonGrid
  parts: Record<string, string>
  /** Per frame, one value per cell */
  atm: Record<AtmKey, Float32Array[]> | null
  /** Wind as u/v (knots, toward east / north) per frame, for interpolation and particles */
  windU: Float32Array[] | null
  windV: Float32Array[] | null
  marine: { points: { lat: number; lon: number; name: string }[]; f: Partial<Record<MarineKey, Float32Array[]>> } | null
  /** Coarse wind over the whole ocean area, as u/v (knots toward east / north) per frame */
  wide: { grid: LatLonGrid; u: Float32Array[]; v: Float32Array[]; gustKn: Float32Array[] } | null
}

/** One wind station: knots, and u/v toward east / north (for blending and time interpolation). */
export interface WindStation {
  id: string
  name: string
  lat: number
  lon: number
  kn: Float32Array
  fromDeg: Float32Array
  gustKn: Float32Array | null
  u: Float32Array
  v: Float32Array
}

export interface WindObs {
  axis: Axis
  stations: WindStation[]
}

/** One model current layer on a regular lat/lon grid (m/s toward east / north per frame). */
export interface OceanLayer {
  id: string
  label: string
  resolutionKm: number
  grid: LatLonGrid
  u: Float32Array[]
  v: Float32Array[]
}

export interface Ocean {
  axis: Axis
  parts: Record<string, string>
  /** Finest first */
  layers: OceanLayer[]
}

export interface Station {
  code: string
  name: string
  kind: 'node' | 'shore'
  lat: number
  lon: number
  depthM: number | null
  s: Partial<Record<StationSeriesKey, Float32Array>>
}

export interface Stations {
  axis: Axis
  parts: Record<string, string>
  stations: Station[]
  twdp: { axis: Axis; c: Partial<Record<TwdpKey, Float32Array>> } | null
}

export interface Currents {
  axis: Axis
  originLat: number
  originLon: number
  dxKm: number
  nx: number
  ny: number
  /** Grid cell (iy × nx + ix) → index in the cell lists, or -1 */
  cellAt: Int32Array
  /** Linear fit of the grid to lat/lon: lon = lon0 + ix × dLon, lat = lat0 + iy × dLat */
  fit: { lon0: number; dLon: number; lat0: number; dLat: number }
  cells: { lat: Float32Array; lon: Float32Array; ix: Int16Array; iy: Int16Array }
  /** Per frame, m/s per cell (NaN = no data) */
  u: Float32Array[]
  v: Float32Array[]
  sites: { code: string; name: string; lat: number; lon: number }[]
}

export interface ProfileNode {
  code: string
  name: string
  lat: number
  lon: number
  depthM: number
  binDepthM: number[]
  /** Per frame, m/s per bin */
  u: Float32Array[]
  v: Float32Array[]
}

export interface Profiles {
  axis: Axis
  nodes: ProfileNode[]
}

export interface Vessel {
  mmsi: number
  name: string
  callsign: string | null
  group: AisGroup
  type: number | null
  lengthM: number | null
  role: 'own' | 'twdp' | null
  /** Epoch ms of each fix */
  t: Float64Array
  lat: Float64Array
  lon: Float64Array
  sogKn: Float32Array
  cogDeg: Float32Array
  hdgDeg: Float32Array
}

export interface Traffic {
  vessels: Vessel[]
}

export interface Climatology {
  years: number[]
  nBins: number
  vars: Partial<Record<ClimateVar, { mean: Float32Array; p10: Float32Array; p90: Float32Array; n: Float32Array }>>
}

/** Everything the bridge knows about one local day. Each part is optional: panels show "—" without it. */
export interface DayData {
  date: string
  /** Local midnight to the next local midnight (epoch ms) */
  dayStart: number
  dayEnd: number
  ship?: ShipDay
  stats?: CrossingStats[]
  profile: RouteProfile
  climatology?: Climatology
  tides?: Tides
  weather?: Weather
  stations?: Stations
  currents?: Currents
  ocean?: Ocean
  windobs?: WindObs
  /** Live only: OpenWeatherMap at the ship (GET /api/weather), the fallback when the Open-Meteo grid is down */
  pointWeather?: { t: number; windKn: number; fromDeg: number; gustKn: number | null; visKm: number | null }
  profiles?: Profiles
  traffic?: Traffic
  sources?: SourceItem[]
}

export type PartName =
  | 'ship' | 'stats' | 'profile' | 'climatology' | 'tides' | 'weather' | 'stations' | 'currents' | 'ocean' | 'windobs' | 'profiles' | 'traffic' | 'sources'

export type PartStatus =
  | { state: 'loading' }
  | { state: 'ready'; source: 'api' | 'snapshot' | 'bundled' | 'live' | 'sample'; ageS?: number }
  | { state: 'missing'; reason: string }
