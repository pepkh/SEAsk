import type { AtmKey, Currents, DayData, LatLonGrid, MarineKey, Weather, WindStation } from './model'
import { frameOf, lastAt, valueAt, type Axis } from './series'

/* Gridded fields at a place and time: bilinear in space, linear between frames. NaN without data. */

/** Bilinear value in a lat/lon grid; missing corners are left out of the weighting. */
export function gridValue(g: LatLonGrid, cells: Float32Array, lat: number, lon: number): number {
  const fx = (lon - g.lon0) / g.dLon
  const fy = (lat - g.lat0) / g.dLat
  if (fx < -0.5 || fy < -0.5 || fx > g.nLon - 0.5 || fy > g.nLat - 0.5) return NaN
  const x0 = Math.max(0, Math.min(g.nLon - 1, Math.floor(fx)))
  const y0 = Math.max(0, Math.min(g.nLat - 1, Math.floor(fy)))
  const x1 = Math.min(g.nLon - 1, x0 + 1)
  const y1 = Math.min(g.nLat - 1, y0 + 1)
  const kx = Math.max(0, Math.min(1, fx - x0))
  const ky = Math.max(0, Math.min(1, fy - y0))
  return blend(
    cells[y0 * g.nLon + x0], cells[y0 * g.nLon + x1], cells[y1 * g.nLon + x0], cells[y1 * g.nLon + x1],
    kx, ky,
  )
}

/** Weighted mean of four corners, skipping NaN corners. */
function blend(a: number, b: number, c: number, d: number, kx: number, ky: number): number {
  const w = [(1 - kx) * (1 - ky), kx * (1 - ky), (1 - kx) * ky, kx * ky]
  const v = [a, b, c, d]
  let sum = 0
  let wsum = 0
  for (let i = 0; i < 4; i++) {
    if (Number.isFinite(v[i])) {
      sum += v[i] * w[i]
      wsum += w[i]
    }
  }
  return wsum > 0.25 ? sum / wsum : NaN
}

/** Interpolation between the two frames around `t`: [i, i + 1, weight of i + 1]. */
export function framePair(axis: Axis, t: number): [number, number, number] | null {
  const f = frameOf(axis, t)
  // Past the ends the end frame holds: one step before, three after (live CODAR maps trail now by 1–2 h).
  if (f < 0) return f >= -1 ? [0, 0, 0] : null
  if (f > axis.n - 1) return f <= axis.n + 2 ? [axis.n - 1, axis.n - 1, 0] : null
  const i = Math.floor(f)
  return [i, Math.min(axis.n - 1, i + 1), f - i]
}

const lerp = (a: number, b: number, k: number) =>
  Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * k : k < 0.5 ? a : b

/** An atmosphere value (Open-Meteo grid) at a place and time. */
export function weatherAt(w: Weather, key: AtmKey, t: number, lat: number, lon: number): number {
  const frames = w.atm?.[key]
  const p = framePair(w.axis, t)
  if (!frames || !p) return NaN
  return lerp(gridValue(w.grid, frames[p[0]], lat, lon), gridValue(w.grid, frames[p[1]], lat, lon), p[2])
}

/**
 * A sampler for a gridded vector field at one time: (lat, lon) → [east, north], or null. Built once per
 * time step (the map samples thousands of places per redraw).
 */
export type VectorSampler = (lat: number, lon: number) => [number, number] | null

function gridSampler(g: LatLonGrid, u: Float32Array[], v: Float32Array[], p: [number, number, number]): VectorSampler {
  const [i, j, k] = p
  return (lat, lon) => {
    const x = lerp(gridValue(g, u[i], lat, lon), gridValue(g, u[j], lat, lon), k)
    const y = lerp(gridValue(g, v[i], lat, lon), gridValue(g, v[j], lat, lon), k)
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
  }
}

/** Model wind (knots toward east / north): the fine grid over the route, the wide grid elsewhere. */
export function windSampler(w: Weather, t: number): VectorSampler | null {
  const p = framePair(w.axis, t)
  if (!p) return null
  const fine = w.windU && w.windV ? gridSampler(w.grid, w.windU, w.windV, p) : null
  const wide = w.wide ? gridSampler(w.wide.grid, w.wide.u, w.wide.v, p) : null
  if (!fine && !wide) return null
  return (lat, lon) => fine?.(lat, lon) ?? wide?.(lat, lon) ?? null
}

/** A marine value at the nearest marine point (the marine model has a few points, not a grid). */
export function marineAt(w: Weather, key: MarineKey, t: number, lat: number, lon: number): number {
  const frames = w.marine?.f[key]
  const p = framePair(w.axis, t)
  if (!w.marine || !frames || !p) return NaN
  let best = -1
  let bestD = Infinity
  w.marine.points.forEach((pt, i) => {
    const d = (pt.lat - lat) ** 2 + ((pt.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2
    if (d < bestD && Number.isFinite(frames[p[0]][i])) {
      bestD = d
      best = i
    }
  })
  return best < 0 ? NaN : lerp(frames[p[0]][best], frames[p[1]][best], p[2])
}

/** Fractional CODAR grid position of a place. */
export function codarXY(c: Currents, lat: number, lon: number): [number, number] {
  return [(lon - c.fit.lon0) / c.fit.dLon, (lat - c.fit.lat0) / c.fit.dLat]
}

function codarCell(c: Currents, frame: Float32Array, ix: number, iy: number): number {
  if (ix < 0 || iy < 0 || ix >= c.nx || iy >= c.ny) return NaN
  const k = c.cellAt[iy * c.nx + ix]
  return k < 0 ? NaN : frame[k]
}

/** Bilinear CODAR value at a fractional grid position in one frame. */
export function codarSample(c: Currents, frame: Float32Array, fx: number, fy: number): number {
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  return blend(
    codarCell(c, frame, x0, y0), codarCell(c, frame, x0 + 1, y0), codarCell(c, frame, x0, y0 + 1), codarCell(c, frame, x0 + 1, y0 + 1),
    fx - x0, fy - y0,
  )
}

/** Where a surface current value comes from. */
export type CurrentSource = { kind: 'radar' } | { kind: 'model'; label: string; resolutionKm: number }

/**
 * Surface currents (m/s toward east / north) blended per place: the CODAR radar where it measured,
 * else the finest model layer with a value (SalishSeaCast near the route, wider SalishSeaCast, then a
 * global model for the open Pacific).
 */
export function currentSampler(day: DayData, t: number): ((lat: number, lon: number) => { uv: [number, number]; source: CurrentSource } | null) | null {
  const c = day.currents
  const radarPair = c ? framePair(c.axis, t) : null
  const radar: VectorSampler | null =
    c && radarPair
      ? (lat, lon) => {
          const [fx, fy] = codarXY(c, lat, lon)
          const [i, j, k] = radarPair
          const u = lerp(codarSample(c, c.u[i], fx, fy), codarSample(c, c.u[j], fx, fy), k)
          const v = lerp(codarSample(c, c.v[i], fx, fy), codarSample(c, c.v[j], fx, fy), k)
          return Number.isFinite(u) && Number.isFinite(v) ? [u, v] : null
        }
      : null
  const o = day.ocean
  const oceanPair = o ? framePair(o.axis, t) : null
  const models = o && oceanPair ? o.layers.map((l) => ({ l, s: gridSampler(l.grid, l.u, l.v, oceanPair) })) : []
  if (!radar && !models.length) return null
  const RADAR: CurrentSource = { kind: 'radar' }
  const sources = models.map(({ l }) => ({ kind: 'model', label: l.label, resolutionKm: l.resolutionKm }) as CurrentSource)
  return (lat, lon) => {
    const r = radar?.(lat, lon)
    if (r) return { uv: r, source: RADAR }
    for (let m = 0; m < models.length; m++) {
      const uv = models[m].s(lat, lon)
      if (uv) return { uv, source: sources[m] }
    }
    return null
  }
}

/** Where a wind value comes from: a station's measurement, or the model. */
export type WindSource = { kind: 'measured'; station: string; distKm: number } | { kind: 'model'; label: string }

/** Measured wind weighs exp(-(d / WIND_OBS_KM)²) against the model: about one near the station, gone by 18 km. */
const WIND_OBS_KM = 6
const WIND_OBS_MAX_KM = 18

/**
 * Hourly stations fill one live 10-minute frame in six: their last reading holds this long (and an
 * hourly replay frame holds until the next).
 */
const WIND_OBS_HOLD_MS = 70 * 60_000

/** A station value at `t`: between frames, else the last reading within WIND_OBS_HOLD_MS. */
function held(a: Axis, v: Float32Array, t: number): number {
  const x = valueAt(a, v, t)
  return Number.isFinite(x) ? x : lastAt(a, v, t, WIND_OBS_HOLD_MS)?.value ?? NaN
}

/** Station wind at `t` (knots toward east / north), or null without a recent reading. */
function stationUv(day: DayData, s: WindStation, t: number): [number, number] | null {
  const a = day.windobs!.axis
  const u = held(a, s.u, t)
  const v = held(a, s.v, t)
  return Number.isFinite(u) && Number.isFinite(v) ? [u, v] : null
}

/**
 * Wind (knots toward east / north) blended per place like the currents: the measured wind near
 * Environment Canada stations, the model (fine grid over the route, coarse wider) elsewhere. The source
 * is the measurement where it outweighs the model.
 */
export function windSourceSampler(day: DayData, t: number): ((lat: number, lon: number) => { uv: [number, number]; source: WindSource } | null) | null {
  const model = day.weather ? windSampler(day.weather, t) : null
  const obs = (day.windobs?.stations ?? []).flatMap((s) => {
    const uv = stationUv(day, s, t)
    return uv ? [{ s, uv, kx: Math.cos((s.lat * Math.PI) / 180) * 111.32 }] : []
  })
  if (!model && !obs.length) return null
  const MODEL: WindSource = { kind: 'model', label: 'Open-Meteo' }
  return (lat, lon) => {
    let wsum = 0
    let wmax = 0
    let u = 0
    let v = 0
    let nearest: (typeof obs)[number] | null = null
    let nearestKm = Infinity
    for (const o of obs) {
      const d = Math.hypot((lon - o.s.lon) * o.kx, (lat - o.s.lat) * 110.57)
      if (d > WIND_OBS_MAX_KM) continue
      const w = Math.exp(-((d / WIND_OBS_KM) ** 2))
      wsum += w
      u += w * o.uv[0]
      v += w * o.uv[1]
      if (w > wmax) wmax = w
      if (d < nearestKm) {
        nearestKm = d
        nearest = o
      }
    }
    const m = model?.(lat, lon) ?? null
    if (!wsum) return m ? { uv: m, source: MODEL } : null
    const measured: [number, number] = [u / wsum, v / wsum]
    const uv: [number, number] = m ? [wmax * measured[0] + (1 - wmax) * m[0], wmax * measured[1] + (1 - wmax) * m[1]] : measured
    const source: WindSource =
      !m || wmax >= 0.5 ? { kind: 'measured', station: nearest!.s.name, distKm: nearestKm } : MODEL
    return { uv, source }
  }
}

/** The measured stations with a reading at `t`, nearest to a place first (for the rail and the map). */
export function windStationsAt(day: DayData, t: number, lat: number, lon: number) {
  if (!day.windobs) return []
  return day.windobs.stations
    .flatMap((s) => {
      const kn = held(day.windobs!.axis, s.kn, t)
      if (!Number.isFinite(kn)) return []
      const uv = stationUv(day, s, t)
      const fromDeg = uv && kn > 0 ? ((Math.atan2(-uv[0], -uv[1]) * 180) / Math.PI + 360) % 360 : NaN
      const gust = s.gustKn ? held(day.windobs!.axis, s.gustKn, t) : NaN
      const distKm = Math.hypot((lon - s.lon) * Math.cos((lat * Math.PI) / 180) * 111.32, (lat - s.lat) * 110.57)
      return [{ station: s, kn, fromDeg, gustKn: gust, distKm }]
    })
    .sort((a, b) => a.distKm - b.distKm)
}
