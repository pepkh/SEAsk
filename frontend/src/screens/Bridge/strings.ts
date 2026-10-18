/*
 * Bridge screen text. English only: a crew screen, and SOG / COG / CPA / HW / LW are the standard
 * maritime words. French can be added later as `fr satisfies typeof en`.
 */

export const en = {
  title: 'Bridge',
  route: 'TWSB · Swartz Bay ⇄ Tsawwassen',
  replay: 'Replay',
  live: 'Live',
  loading: 'Loading',
  missing: 'No data',
  advisory: 'Advisory only. Not for navigation.',

  // Header
  layers: 'Layers',
  layerNone: 'None',
  layerCurrents: 'Currents',
  layerWind: 'Wind',
  basemapSatellite: 'Satellite',
  basemapChart: 'Chart',
  basemapPlain: 'Plain',
  night: 'Night',
  ask: 'Ask',
  sources: 'Data sources',

  // Own ship
  ownShip: 'Own ship',
  nav: 'Navigation',
  sog: 'SOG',
  cog: 'COG',
  hdg: 'HDG',
  motion: 'Motion',
  roll: 'Roll',
  rollStd: 'Roll σ 60 s',
  heave: 'Heave',
  comfort: 'Ride',
  voyage: 'Voyage',
  crossing: 'Crossing {id}',
  atBerth: 'At {place}',
  underWay: 'Under way',
  nextDeparture: 'Next departure {time}',
  noMoreSailings: 'No more sailings today',
  eta: 'ETA',
  arrived: 'Arrived {time}',
  progress: 'Progress',
  zone: 'Zone',
  water: 'Surface water',
  usualHere: 'usual here',
  usualFromClimatology: 'Aug {years}',
  usualFromToday: 'today’s crossings',
  air: 'Air',
  airTemp: 'Air temp',
  baro: 'Pressure',
  sensorQc: 'Sensor QC',
  qcGood: 'good',
  qcSuspect: 'probably bad',
  qcBad: 'bad / pump off',
  qcMissing: 'no data',

  // Conditions
  conditions: 'Conditions',
  tides: 'Tides',
  rising: 'rising',
  falling: 'falling',
  activePass: 'Active Pass current',
  flood: 'flood',
  ebb: 'ebb',
  slackIn: 'Slack {time} · in {wait}',
  wind: 'Wind',
  windModel: 'At ship (model)',
  windMeasured: 'At ship (measured)',
  windNearest: 'Nearest station',
  gust: 'gust',
  sea: 'Sea and sky',
  waves: 'Waves',
  visibility: 'Visibility',
  cloud: 'Cloud',
  rain: 'Rain',
  sun: 'Sun',
  sunset: 'Sunset',
  dusk: 'Civil dusk',
  surfaceCurrent: 'Surface current (radar)',
  surfaceCurrentModel: 'Surface current (model)',
  noRadar: 'No current data here',
  deepWater: 'Deep water (ONC VENUS)',
  depthCurrents: 'Currents by depth (ADCP)',
  twdp: 'TWDP ferry (Tsawwassen–Duke Point)',
  traffic: 'Traffic (AIS)',
  trafficReplayOnly: 'AIS is available in replay only',
  noTargets: 'No vessels near',

  // Timeline
  play: 'Play',
  pause: 'Pause',
  back10: 'Back 10 min',
  forward10: 'Forward 10 min',
  toStart: 'Start of day',
  toEnd: 'End of day',
  speed: 'Speed',
  timeline: 'Time of day',
} as const

export type BridgeText = keyof typeof en

/** The text for a key with `{name}` placeholders filled in. */
export function t(key: BridgeText, vars?: Record<string, string | number>): string {
  let s: string = en[key]
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

/** Number with fixed decimals, "—" when missing. */
export function num(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(digits)
}

/** Bearing as three digits, "—" when missing. */
export function deg(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : `${String(Math.round(v) % 360).padStart(3, '0')}°`
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

/** 16-point compass name, "—" when missing. */
export function compass(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : POINTS[Math.round((((v % 360) + 360) % 360) / 22.5) % 16]
}

/** Display names of the route zones (ids from src/config/route.json). */
export const ZONE_NAMES: Record<string, string> = {
  'swartz-bay': 'Swartz Bay',
  'swanson-channel': 'Swanson Channel',
  'active-pass': 'Active Pass',
  'strait-of-georgia': 'Strait of Georgia',
  tsawwassen: 'Tsawwassen',
}
