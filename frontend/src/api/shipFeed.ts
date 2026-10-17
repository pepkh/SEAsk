import { API_URL, REPLAY_SPEED, USE_MOCKS } from '../config/env'
import type { ShipRow } from '../types/feed'

/** The latest ship row: the mock feed now, GET /api/ship/latest when VITE_USE_MOCKS=false. */
export async function getLatestRow(): Promise<ShipRow> {
  if (USE_MOCKS) return mockRow(new Date())
  const res = await fetch(`${API_URL}/api/ship/latest`)
  if (!res.ok) throw new Error(`GET /api/ship/latest failed: ${res.status}`)
  return res.json()
}

let feed: ShipRow[] | undefined

/**
 * The mock feed holds one cycle of rows. The time of day (times the replay speed)
 * selects the row. Values between two rows are interpolated, like a 1 Hz feed.
 */
async function mockRow(now: Date): Promise<ShipRow> {
  feed ??= (await import('../mocks/common/ship-feed.json')).default as ShipRow[]
  const stepS = 10
  const secOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000
  const pos = ((secOfDay * REPLAY_SPEED) % (feed.length * stepS)) / stepS
  const a = feed[Math.floor(pos)]
  const b = feed[(Math.floor(pos) + 1) % feed.length]
  const t = pos % 1
  const lerp = (x: number | null, y: number | null) => (x === null || y === null ? x : x + (y - x) * t)
  const turn = ((((b.ship_course - a.ship_course) % 360) + 540) % 360) - 180

  return {
    ...a,
    time: now.toISOString(),
    time_local: now.toISOString(),
    latitude: lerp(a.latitude, b.latitude)!,
    longitude: lerp(a.longitude, b.longitude)!,
    air_temperature: lerp(a.air_temperature, b.air_temperature),
    barometric_pressure: lerp(a.barometric_pressure, b.barometric_pressure),
    cdom_fluorescence: lerp(a.cdom_fluorescence, b.cdom_fluorescence),
    chlorophyll: lerp(a.chlorophyll, b.chlorophyll),
    conductivity: lerp(a.conductivity, b.conductivity),
    salinity: lerp(a.salinity, b.salinity),
    ship_course: (a.ship_course + turn * t + 360) % 360,
    sound_speed: lerp(a.sound_speed, b.sound_speed),
    speed_over_ground: lerp(a.speed_over_ground, b.speed_over_ground)!,
    tsg_temperature: lerp(a.tsg_temperature, b.tsg_temperature),
    turbidity: lerp(a.turbidity, b.turbidity),
  }
}
