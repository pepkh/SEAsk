import { LIVE_DATA, REPLAY_SPEED } from '../config/env'
import type { ShipRow } from '../types/feed'
import type { DataSource } from '../types/source'
import { getJson } from './http'

export interface FeedRow {
  row: ShipRow
  source: DataSource
}

/** GET /api/ship/latest. Course and speed can be missing for a moment. */
type LiveRow = Omit<ShipRow, 'ship_course' | 'speed_over_ground'> & {
  ship_course: number | null
  speed_over_ground: number | null
}

/** After this many failed polls in a row, the kiosk switches to the sample feed. */
const MAX_FAILURES = 3
/** While on the sample feed, the live feed is tried again this often (ms). */
const RETRY_MS = 30_000

let lastLive: ShipRow | undefined
let failures = 0
let retryAt = 0

/**
 * The latest ship row. With VITE_LIVE_DATA it comes from the backend (Ocean Networks Canada).
 * A short outage (up to 3 failed polls) repeats the last live row. After that, or when there has been
 * no live row yet, the sample feed takes over and the live feed is tried again every 30 s.
 */
export async function getLatestRow(): Promise<FeedRow> {
  if (LIVE_DATA && Date.now() >= retryAt) {
    try {
      const row = await getJson<LiveRow>('/api/ship/latest', 4000)
      failures = 0
      lastLive = {
        ...row,
        ship_course: row.ship_course ?? lastLive?.ship_course ?? 0,
        speed_over_ground: row.speed_over_ground ?? lastLive?.speed_over_ground ?? 0,
      }
      return { row: lastLive, source: 'live' }
    } catch (err) {
      failures += 1
      if (lastLive && failures < MAX_FAILURES) return { row: lastLive, source: 'live' }
      if (lastLive || failures === 1) console.warn('Live ship feed unavailable, showing the sample feed.', err)
      lastLive = undefined
      retryAt = Date.now() + RETRY_MS
    }
  }
  return { row: await mockRow(new Date()), source: 'sample' }
}

let feed: ShipRow[] | undefined

/**
 * The sample feed holds one cycle of rows. The time of day (times the replay speed)
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
  // Angles take the short way round (350° → 10° turns through 0°).
  const angle = (x: number, y: number) => (x + (((((y - x) % 360) + 540) % 360) - 180) * t + 360) % 360

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
    ship_course: angle(a.ship_course, b.ship_course),
    heading: a.heading === null || a.heading === undefined || b.heading === null || b.heading === undefined ? a.heading : angle(a.heading, b.heading),
    sound_speed: lerp(a.sound_speed, b.sound_speed),
    speed_over_ground: lerp(a.speed_over_ground, b.speed_over_ground)!,
    tsg_temperature: lerp(a.tsg_temperature, b.tsg_temperature),
    turbidity: lerp(a.turbidity, b.turbidity),
  }
}
