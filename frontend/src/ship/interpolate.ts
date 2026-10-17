import type { ShipRow } from '../types/feed'

/** A row between `a` and `b` (t = 0 at a, 1 at b), stamped with `time`. Angles take the short way round. */
export function interpolateRow(a: ShipRow, b: ShipRow, t: number, time: Date): ShipRow {
  const lerp = (x: number | null, y: number | null) => (x === null || y === null ? x : x + (y - x) * t)
  // 350° → 10° turns through 0°.
  const angle = (x: number, y: number) => (x + (((((y - x) % 360) + 540) % 360) - 180) * t + 360) % 360
  return {
    ...a,
    time: time.toISOString(),
    time_local: time.toISOString(),
    latitude: lerp(a.latitude, b.latitude)!,
    longitude: lerp(a.longitude, b.longitude)!,
    air_temperature: lerp(a.air_temperature, b.air_temperature),
    barometric_pressure: lerp(a.barometric_pressure, b.barometric_pressure),
    cdom_fluorescence: lerp(a.cdom_fluorescence, b.cdom_fluorescence),
    chlorophyll: lerp(a.chlorophyll, b.chlorophyll),
    conductivity: lerp(a.conductivity, b.conductivity),
    oxygen_saturation: lerp(a.oxygen_saturation, b.oxygen_saturation),
    salinity: lerp(a.salinity, b.salinity),
    ship_course: angle(a.ship_course, b.ship_course),
    heading: a.heading === null || a.heading === undefined || b.heading === null || b.heading === undefined ? a.heading : angle(a.heading, b.heading),
    sound_speed: lerp(a.sound_speed, b.sound_speed),
    speed_over_ground: lerp(a.speed_over_ground, b.speed_over_ground)!,
    tsg_temperature: lerp(a.tsg_temperature, b.tsg_temperature),
    turbidity: lerp(a.turbidity, b.turbidity),
  }
}

/** Index of the last row at or before `at` (ms), by binary search over `times` (ascending), or -1. */
export function indexAt(times: number[], at: number): number {
  let lo = 0
  let hi = times.length - 1
  if (hi < 0 || at < times[0]) return -1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (times[mid] <= at) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** The ship row at time `at` (ms), interpolated between the two recorded rows around it. */
export function rowAt(rows: ShipRow[], times: number[], at: number): ShipRow | null {
  const i = indexAt(times, at)
  if (i < 0) return rows[0] ?? null
  if (i >= rows.length - 1) return rows[rows.length - 1]
  const span = times[i + 1] - times[i]
  const t = span > 0 ? (at - times[i]) / span : 0
  return interpolateRow(rows[i], rows[i + 1], t, new Date(at))
}
