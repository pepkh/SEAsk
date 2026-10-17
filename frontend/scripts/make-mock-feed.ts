/**
 * Makes src/mocks/common/ship-feed.json: one 4-hour cycle of ship rows (dock at Swartz Bay,
 * cross to Tsawwassen, dock, cross back), one row every 10 s, with the API column names.
 *
 * The mock adapter picks row ((local seconds since midnight × replay speed) mod 4 h) / 10 s.
 * The cycle is shifted so that at 2:41 PM (speed 1) the ship is at Active Pass, going east,
 * with the readings from the mockup.
 *
 * Run: node scripts/make-mock-feed.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { bearingDeg, cumulativeM, pointAlong } from '../src/ship/geo.ts'
import type { ShipRow } from '../src/types/feed.ts'
import type { Route } from '../src/types/route.ts'

const root = new URL('..', import.meta.url)
const route: Route = JSON.parse(readFileSync(new URL('src/config/route.json', root), 'utf8'))

const STEP_S = 10
const CYCLE_S = 4 * 3600
const RAMP_S = 5 * 60
const MOCKUP_TIME_S = 14 * 3600 + 41 * 60
const KN = 0.514444 // m/s
const CRUISE_KN = 18.6 // mockup speed

const cumulative = cumulativeM(route.points)
const lengthM = cumulative[cumulative.length - 1]
const cruise = CRUISE_KN * KN // m/s
// The ramps make the crossing RAMP_S longer than at cruise speed all the way.
const CROSS_S = Math.round(lengthM / cruise + RAMP_S)
const DOCK_S = CYCLE_S / 2 - CROSS_S

/** Distance sailed at time t of a crossing (speed ramps up and down over RAMP_S). */
function sailed(t: number): { m: number; speed: number } {
  if (t < RAMP_S) return { m: (cruise * t * t) / (2 * RAMP_S), speed: (cruise * t) / RAMP_S }
  if (t > CROSS_S - RAMP_S) {
    const left = CROSS_S - t
    return { m: lengthM - (cruise * left * left) / (2 * RAMP_S), speed: (cruise * left) / RAMP_S }
  }
  return { m: (cruise * RAMP_S) / 2 + cruise * (t - RAMP_S), speed: cruise }
}

/** Readings along the route (fraction from Swartz Bay). Active Pass values are the mockup values. */
const at = route.activePassAt
const PROFILES: Record<string, [number, number][]> = {
  tsg_temperature: [[0, 10.7], [0.25, 10.62], [at, 10.42], [0.75, 10.12], [1, 10.3]],
  salinity: [[0, 30.52], [0.25, 30.41], [at, 30.08], [0.75, 29.92], [1, 29.66]],
  conductivity: [[0, 3.38], [0.25, 3.37], [at, 3.33], [0.75, 3.31], [1, 3.29]],
  chlorophyll: [[0, 2.12], [0.25, 2.02], [at, 1.82], [0.75, 1.58], [1, 1.47]],
  turbidity: [[0, 0.66], [0.25, 0.72], [at, 0.94], [0.75, 1.08], [1, 1.32]],
  cdom_fluorescence: [[0, 1.92], [0.25, 1.98], [at, 2.1], [0.75, 2.28], [1, 2.55]],
  sound_speed: [[0, 1485.4], [0.25, 1485.2], [at, 1484.7], [0.75, 1484.3], [1, 1484.5]],
}

function profile(key: string, f: number): number {
  const p = PROFILES[key]
  const i = Math.max(0, p.findIndex(([x]) => x >= f) - 1)
  const [x0, y0] = p[i]
  const [x1, y1] = p[Math.min(i + 1, p.length - 1)]
  return x1 === x0 ? y0 : y0 + ((f - x0) / (x1 - x0)) * (y1 - y0)
}

/** Ship state at time t of the cycle. Fraction is measured from Swartz Bay. */
function stateAt(t: number): { fraction: number; speed: number; course: number } {
  const legs = [
    { until: DOCK_S, kind: 'dock-swb' },
    { until: DOCK_S + CROSS_S, kind: 'east' },
    { until: 2 * DOCK_S + CROSS_S, kind: 'dock-tsa' },
    { until: CYCLE_S, kind: 'west' },
  ] as const
  const leg = legs.find((l) => t < l.until)!
  const start = leg.until - (leg.kind.startsWith('dock') ? DOCK_S : CROSS_S)
  const courseAt = (m: number) => {
    const next = cumulative.findIndex((c) => c > m)
    const i = next === -1 ? route.points.length - 2 : Math.max(0, next - 1)
    return bearingDeg(route.points[i], route.points[i + 1])
  }
  switch (leg.kind) {
    case 'dock-swb':
      return { fraction: 0, speed: 0, course: (courseAt(0) + 180) % 360 }
    case 'dock-tsa':
      return { fraction: 1, speed: 0, course: courseAt(lengthM - 1) }
    case 'east': {
      const { m, speed } = sailed(t - start)
      return { fraction: m / lengthM, speed, course: courseAt(m) }
    }
    case 'west': {
      const { m, speed } = sailed(t - start)
      return { fraction: 1 - m / lengthM, speed, course: (courseAt(lengthM - m) + 180) % 360 }
    }
  }
}

// Find the cycle time when the eastbound ship is at Active Pass, then shift the cycle.
let apTime = DOCK_S
while (stateAt(apTime).fraction < at) apTime += 1
const phase = (((apTime - MOCKUP_TIME_S) % CYCLE_S) + CYCLE_S) % CYCLE_S
const mockupCycleTime = apTime

const round = (v: number, d: number) => Number(v.toFixed(d))
const pad = (n: number) => String(n).padStart(2, '0')
const rows: ShipRow[] = []

for (let k = 0; k < CYCLE_S / STEP_S; k++) {
  const secOfDay = k * STEP_S
  const s = stateAt((phase + secOfDay) % CYCLE_S)
  const [lat, lon] = pointAlong(route.points, cumulative, s.fraction * lengthM)
  const hh = Math.floor(secOfDay / 3600), mm = Math.floor((secOfDay % 3600) / 60), ss = secOfDay % 60
  // Air values change slowly over the cycle. They equal the mockup values at 2:41 PM.
  const air = (2 * Math.PI * (((phase + secOfDay) % CYCLE_S) - mockupCycleTime)) / CYCLE_S
  rows.push({
    time: new Date(Date.UTC(2025, 7, 17, hh + 7, mm, ss)).toISOString(),
    time_local: `2025-08-17T${pad(hh)}:${pad(mm)}:${pad(ss)}-07:00`,
    latitude: round(lat, 6),
    longitude: round(lon, 6),
    air_temperature: round(11.2 - 0.3 * (1 - Math.cos(air)), 2),
    barometric_pressure: round(1013.1 + 0.3 * Math.sin(air), 2),
    cdom_fluorescence: round(profile('cdom_fluorescence', s.fraction), 3),
    chlorophyll: round(profile('chlorophyll', s.fraction), 3),
    conductivity: round(profile('conductivity', s.fraction), 4),
    current: null,
    roll: null,
    salinity: round(profile('salinity', s.fraction), 3),
    ship_course: round(s.course, 1),
    sound_speed: round(profile('sound_speed', s.fraction), 2),
    speed_over_ground: round(s.speed / KN, 2),
    systemstatus: null,
    tank_level: null,
    tsg_temperature: round(profile('tsg_temperature', s.fraction), 3),
    turbidity: round(profile('turbidity', s.fraction), 3),
    valve_position_status: null,
  })
}

const out = new URL('src/mocks/common/ship-feed.json', root)
writeFileSync(out, JSON.stringify(rows))
console.log(`Wrote ${rows.length} rows to ${out.pathname} (route ${(lengthM / 1000).toFixed(1)} km, crossing ${Math.round(CROSS_S / 60)} min, dock ${Math.round(DOCK_S / 60)} min)`)
