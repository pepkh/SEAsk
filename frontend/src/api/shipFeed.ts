import { LIVE_DATA, REPLAY_SPEED } from '../config/env'
import { interpolateRow } from '../ship/interpolate'
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
  return interpolateRow(a, b, pos % 1, now)
}

/** GET /api/ship/history: the recent track, oldest first, one row per step. */
interface LiveHistory {
  source: 'live'
  step_s: number
  rows: LiveRow[]
}

export interface FeedHistory {
  rows: ShipRow[]
  source: DataSource
}

/** Rows this far apart when the sample feed fills in the past (s) */
const SAMPLE_HISTORY_STEP_S = 5

/**
 * The last `minutes` of the ship's track, so a visitor session starts with the whole current crossing (the kiosk
 * polls nothing while it waits on the welcome screen). Live from the backend with VITE_LIVE_DATA, else made from
 * the sample feed, which can say where the ship was at any time.
 */
export async function getHistory(minutes: number): Promise<FeedHistory> {
  if (LIVE_DATA) {
    try {
      const body = await getJson<LiveHistory>(`/api/ship/history?minutes=${minutes}&step=5`, 15_000)
      let course = 0
      let speed = 0
      const rows = body.rows.map((row) => {
        course = row.ship_course ?? course
        speed = row.speed_over_ground ?? speed
        return { ...row, ship_course: course, speed_over_ground: speed }
      })
      return { rows, source: 'live' }
    } catch (err) {
      console.warn('Live ship history unavailable, starting with the sample history.', err)
    }
  }
  const now = Date.now()
  const count = Math.floor((minutes * 60) / SAMPLE_HISTORY_STEP_S)
  const rows = await Promise.all(Array.from({ length: count }, (_, i) => mockRow(new Date(now - (count - i) * SAMPLE_HISTORY_STEP_S * 1000))))
  return { rows, source: 'sample' }
}
