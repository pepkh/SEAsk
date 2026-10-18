/*
 * Wire types of the captain's bridge datasets: GET /bridge/{date}/{dataset} (a recorded day) and
 * GET /api/bridge/{dataset} (live). Every per-time list has `n` values, one per `stepS` from `t0`,
 * with null for a missing value.
 */

export type BridgeMode = 'replay' | 'live'
export type Direction = 'swb_to_tsa' | 'tsa_to_swb'

/** The time axis every dataset carries. */
export interface WireAxis {
  /** ISO UTC */
  t0: string
  stepS: number
  n: number
}

interface WireBase extends WireAxis {
  mode: BridgeMode
  date: string
  credit: string
  /** Live payloads only (ISO UTC) */
  now?: string
}

type Col = (number | null)[]
type Grid = Col[]

export interface CrossingRef {
  id: number
  direction: Direction
  start: string
  end: string
}

export interface ShipDayWire extends WireBase {
  dataset: 'ship'
  zones: string[]
  comfortLevels: string[]
  crossings: CrossingRef[]
  lat: Col
  lon: Col
  sogKn: Col
  cogDeg: Col
  hdgDeg: Col
  rollDeg: Col
  rollStd: Col
  heaveM: Col
  airC: Col
  baroHpa: Col
  sstC: Col
  sal: Col
  o2Sat: Col
  chl: Col
  turb: Col
  cdom: Col
  sigmaT: Col
  frac: Col
  crossing: Col
  zone: Col
  comfort: Col
  tsgFlag: Col
  oxyFlag: Col
  opticsFlag: Col
}

export interface TideStationWire {
  code: string
  name: string
  lat: number
  lon: number
  heights: Col
  extremes: { type: 'high' | 'low'; h: number; t: string }[]
}

export interface TidesWire extends WireBase {
  dataset: 'tides'
  stations: TideStationWire[]
  current: {
    code: string
    station: string
    lat: number
    lon: number
    floodDeg: number | null
    kn: Col
    towardDeg: Col
    /** + flood, − ebb */
    signedKn: Col
    events: { type: 'slack' | 'flood' | 'ebb'; t: string; kn: number }[]
  } | null
}

export interface WeatherWire extends WireBase {
  dataset: 'weather'
  parts: Record<'atmosphere' | 'marine', string>
  /** Cell index = iy × nLon + ix; iy 0 is the south row, ix 0 the west column. */
  grid: { lat0: number; lon0: number; dLat: number; dLon: number; nLat: number; nLon: number }
  atmosphere: {
    windKn: Grid
    windFromDeg: Grid
    gustKn: Grid
    pressureHpa: Grid
    tempC: Grid
    cloudPct: Grid
    precipMm: Grid
    visKm: Grid
  } | null
  marine: {
    points: { lat: number[]; lon: number[]; name?: string[] }
    waveM: Grid
    waveFromDeg: Grid
    wavePeriodS: Grid
    sstC: Grid
    currentKn?: Grid
    currentTowardDeg?: Grid
  } | null
  /** Coarse wind over the whole ocean area (outside the fine grid) */
  wide?: {
    grid: { lat0: number; lon0: number; dLat: number; dLon: number; nLat: number; nLon: number }
    windKn: Grid
    windFromDeg: Grid
    gustKn: Grid
  } | null
}

export type StationSeriesKey =
  | 'tempC' | 'sal' | 'sigmaT' | 'soundSpeed' | 'o2MlL' | 'o2Sat' | 'chl' | 'turb'
  | 'curEastMs' | 'curNorthMs' | 'windKn' | 'windFromDeg' | 'gustKn' | 'baroHpa'

export interface StationWire {
  code: string
  name: string
  kind: 'node' | 'shore'
  lat: number
  lon: number
  depthM: number | null
  series: Partial<Record<StationSeriesKey, Col>>
}

export type TwdpKey = 'lat' | 'lon' | 'hdgDeg' | 'cogDeg' | 'sogKn' | 'sstC' | 'sal' | 'o2Sat' | 'chl' | 'turb' | 'cdom' | 'airC'

export interface StationsWire extends WireBase {
  dataset: 'stations'
  parts: Record<string, string>
  stations: StationWire[]
  twdp: (WireAxis & Partial<Record<TwdpKey, Col>>) | null
}

export interface CurrentsWire extends WireBase {
  dataset: 'currents'
  unit: 'cm/s'
  grid: { originLat: number; originLon: number; dxKm: number; nx: number; ny: number }
  cells: { ix: number[]; iy: number[]; lat: number[]; lon: number[] }
  /** Eastward, int cm/s */
  u: Grid
  /** Northward, int cm/s */
  v: Grid
  sites: { code: string; name: string; lat: number; lon: number }[]
}

/** Measured wind at Environment and Climate Change Canada stations (the wind counterpart of the radar). */
export interface WindObsWire extends WireBase {
  dataset: 'windobs'
  stations: {
    id: string
    name: string
    lat: number
    lon: number
    elevM: number | null
    /** knots */
    kn: Col
    /** where it blows from, degrees; null when calm */
    fromDeg: Col
    gustKn: Col | null
  }[]
}

/** Model surface currents, finest layer first (SalishSeaCast fine and wide, then a global model). */
export interface OceanWire extends WireBase {
  dataset: 'ocean'
  parts: Record<string, string>
  layers: {
    id: string
    label: string
    depth?: string
    resolutionKm: number
    grid: { lat0: number; lon0: number; dLat: number; dLon: number; nLat: number; nLon: number }
    /** int cm/s, east / north */
    u: Grid
    v: Grid
  }[]
}

export interface ProfilesWire extends WireBase {
  dataset: 'profiles'
  nodes: {
    code: string
    name: string
    lat: number
    lon: number
    depthM: number
    /** Below the surface, shallow first */
    binDepthM: number[]
    /** m/s east, [n][bins] */
    u: Grid
    v: Grid
  }[]
}

export const AIS_GROUPS = ['passenger', 'cargo', 'tanker', 'tug', 'fishing', 'pleasure', 'sailing', 'hsc', 'special', 'other', 'unknown'] as const
export type AisGroup = (typeof AIS_GROUPS)[number]

export interface VesselWire {
  mmsi: number
  name: string | null
  callsign: string | null
  /** Index into `groups` */
  group: number
  type: number | null
  lengthM: number | null
  beamM: number | null
  role: 'own' | 'twdp' | null
  /** Seconds from t0 */
  t: number[]
  lat: number[]
  lon: number[]
  sogKn: (number | null)[]
  cogDeg: (number | null)[]
  hdgDeg: (number | null)[]
}

export interface TrafficWire extends WireBase {
  dataset: 'traffic'
  t1: string
  bbox: [number, number, number, number]
  groups: string[]
  vessels: VesselWire[]
}

export interface SourceItem {
  location: string
  locationName: string
  lat: number | null
  lon: number | null
  depthM: number | null
  category: string
  kind: 'scalar' | 'archive' | 'product'
  sensors: string[]
  status: 'ok' | 'no_data'
  deviceCode: string | null
  deviceName: string | null
  deployedFrom: string | null
  usedBy: string | null
}

export interface SourcesWire {
  dataset: 'sources'
  mode: BridgeMode
  date: string
  items: SourceItem[]
  credit: string
}

/**
 * The SEAsk team's experimental biofouling model for one day (backend/scripts/build_fouling.py; a
 * snapshot only, no API route). No time axis: one model run.
 */
export interface FoulingWire {
  dataset: 'fouling'
  mode: BridgeMode
  date: string
  status: string
  grid: { lat0: number; lon0: number; dLat: number; dLon: number; nLat: number; nLon: number }
  /** Relative 0-100 per cell (higher = more fouling); null outside the training extent or on land */
  score: Col
  /** Spread across the model's scenarios, same units */
  spread: Col
  /** 0 no model point (land at this resolution), 1 outside the training extent, 2 scored */
  cover: number[]
  credit: string
}

export type ClimateVar = 'sst' | 'sal' | 'o2Sat' | 'chl' | 'turb'

export interface ClimatologyWire {
  dataset: 'climatology'
  window: string
  years: number[]
  nBins: number
  vars: Partial<Record<ClimateVar, { mean: Col; p10: Col; p90: Col; n: Col }>>
  credit: string
}

/** GET /trips/stats (backend/app/routes/derived.py) */
export interface CrossingStats {
  id: number
  direction: Direction
  start: string
  end: string
  duration_min: number
  track_km: number
  avg_kn: number | null
  max_kn: number | null
  dwell_before_min: number | null
  active_pass_min: number
  roll_std: number | null
  max_abs_roll: number | null
  sst: number | null
  salinity: number | null
  salinity_min: number | null
  salinity_max: number | null
  o2_sat: number | null
  chl: number | null
  tsg_missing: boolean
}

export interface BridgeDaysWire {
  days: { date: string; t0: string; t1: string; datasets: Record<string, boolean> }[]
  climatology: boolean
  live: Record<string, boolean>
}
