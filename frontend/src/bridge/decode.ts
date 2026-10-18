import { AIS_GROUPS, type ClimatologyWire, type CurrentsWire, type FoulingWire, type OceanWire, type ProfilesWire, type WindObsWire, type ShipDayWire, type StationSeriesKey, type StationsWire, type TidesWire, type TrafficWire, type TwdpKey, type WeatherWire } from '../types/bridge'
import type { AtmKey, Climatology, Currents, Fouling, MarineKey, Ocean, Profiles, ShipDay, Stations, Tides, Traffic, Weather, WindObs } from './model'
import { SHIP_KEYS } from './model'
import { axisOf, toFloat } from './series'

/* Wire payloads → typed arrays. Done once per load; every lookup afterwards is by index. */

const grid = (frames: readonly (readonly (number | null)[])[] | undefined, n: number, cells: number, scale = 1): Float32Array[] =>
  Array.from({ length: n }, (_, i) => {
    const f = toFloat(frames?.[i], cells)
    if (scale !== 1) for (let k = 0; k < f.length; k++) f[k] *= scale
    return f
  })

export function decodeShip(w: ShipDayWire): ShipDay {
  const axis = axisOf(w)
  const c = Object.fromEntries(SHIP_KEYS.map((k) => [k, toFloat(w[k], axis.n)])) as ShipDay['c']
  return {
    axis,
    c,
    zones: w.zones,
    comfortLevels: w.comfortLevels,
    crossings: w.crossings.map((x) => ({ id: x.id, direction: x.direction, start: Date.parse(x.start), end: Date.parse(x.end) })),
  }
}

export function decodeTides(w: TidesWire): Tides {
  const axis = axisOf(w)
  return {
    axis,
    stations: w.stations.map((s) => ({
      code: s.code,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      h: toFloat(s.heights, axis.n),
      extremes: s.extremes.map((e) => ({ type: e.type, h: e.h, t: Date.parse(e.t) })),
    })),
    current: w.current && {
      code: w.current.code,
      station: w.current.station,
      lat: w.current.lat,
      lon: w.current.lon,
      floodDeg: w.current.floodDeg,
      kn: toFloat(w.current.kn, axis.n),
      towardDeg: toFloat(w.current.towardDeg, axis.n),
      signedKn: toFloat(w.current.signedKn, axis.n),
      events: w.current.events.map((e) => ({ type: e.type, kn: e.kn, t: Date.parse(e.t) })),
    },
  }
}

const ATM_KEYS: AtmKey[] = ['windKn', 'windFromDeg', 'gustKn', 'pressureHpa', 'tempC', 'cloudPct', 'precipMm', 'visKm']
const MARINE_KEYS: MarineKey[] = ['waveM', 'waveFromDeg', 'wavePeriodS', 'sstC', 'currentKn', 'currentTowardDeg']

export function decodeWeather(w: WeatherWire): Weather {
  const axis = axisOf(w)
  const cells = w.grid.nLat * w.grid.nLon
  const atm = w.atmosphere
    ? (Object.fromEntries(ATM_KEYS.map((k) => [k, grid(w.atmosphere![k], axis.n, cells)])) as Weather['atm'])
    : null
  let windU: Float32Array[] | null = null
  let windV: Float32Array[] | null = null
  if (atm) {
    // Wind comes FROM windFromDeg: the air moves toward windFromDeg + 180.
    windU = atm.windKn.map((speed, i) => speed.map((s, k) => -s * Math.sin((atm.windFromDeg[i][k] * Math.PI) / 180)))
    windV = atm.windKn.map((speed, i) => speed.map((s, k) => -s * Math.cos((atm.windFromDeg[i][k] * Math.PI) / 180)))
  }
  const m = w.marine
  const points = m ? m.points.lat.map((lat, i) => ({ lat, lon: m.points.lon[i], name: m.points.name?.[i] ?? '' })) : []
  let wide: Weather['wide'] = null
  if (w.wide) {
    const cellsWide = w.wide.grid.nLat * w.wide.grid.nLon
    const kn = grid(w.wide.windKn, axis.n, cellsWide)
    const from = grid(w.wide.windFromDeg, axis.n, cellsWide)
    wide = {
      grid: w.wide.grid,
      u: kn.map((speed, i) => speed.map((sp, k) => -sp * Math.sin((from[i][k] * Math.PI) / 180))),
      v: kn.map((speed, i) => speed.map((sp, k) => -sp * Math.cos((from[i][k] * Math.PI) / 180))),
      gustKn: grid(w.wide.gustKn, axis.n, cellsWide),
    }
  }
  return {
    wide,
    axis,
    grid: w.grid,
    parts: w.parts,
    atm,
    windU,
    windV,
    marine: m
      ? { points, f: Object.fromEntries(MARINE_KEYS.filter((k) => m[k]).map((k) => [k, grid(m[k], axis.n, points.length)])) }
      : null,
  }
}

export function decodeStations(w: StationsWire): Stations {
  const axis = axisOf(w)
  const twdpAxis = w.twdp ? axisOf(w.twdp) : null
  return {
    axis,
    parts: w.parts,
    stations: w.stations.map((s) => ({
      code: s.code,
      name: s.name,
      kind: s.kind,
      lat: s.lat,
      lon: s.lon,
      depthM: s.depthM,
      s: Object.fromEntries(
        Object.entries(s.series).map(([k, col]) => [k, toFloat(col, axis.n)]),
      ) as Partial<Record<StationSeriesKey, Float32Array>>,
    })),
    twdp:
      w.twdp && twdpAxis
        ? {
            axis: twdpAxis,
            c: Object.fromEntries(
              Object.entries(w.twdp)
                .filter(([, col]) => Array.isArray(col))
                .map(([k, col]) => [k, toFloat(col as (number | null)[], twdpAxis.n)]),
            ) as Partial<Record<TwdpKey, Float32Array>>,
          }
        : null,
  }
}

export function decodeCurrents(w: CurrentsWire): Currents {
  const axis = axisOf(w)
  const { nx, ny } = w.grid
  const count = w.cells.ix.length
  const cellAt = new Int32Array(nx * ny).fill(-1)
  w.cells.ix.forEach((ix, k) => {
    const iy = w.cells.iy[k]
    if (ix >= 0 && ix < nx && iy >= 0 && iy < ny) cellAt[iy * nx + ix] = k
  })
  return {
    axis,
    fit: gridFit(w),
    originLat: w.grid.originLat,
    originLon: w.grid.originLon,
    dxKm: w.grid.dxKm,
    nx,
    ny,
    cellAt,
    cells: {
      lat: Float32Array.from(w.cells.lat),
      lon: Float32Array.from(w.cells.lon),
      ix: Int16Array.from(w.cells.ix),
      iy: Int16Array.from(w.cells.iy),
    },
    // cm/s → m/s
    u: grid(w.u, axis.n, count, 0.01),
    v: grid(w.v, axis.n, count, 0.01),
    sites: w.sites,
  }
}

/** Least-squares lon = a + b·ix and lat = c + d·iy over the cells (the km grid is near-linear in degrees). */
function gridFit(w: CurrentsWire): Currents['fit'] {
  const fit = (x: number[], y: number[]) => {
    const n = x.length
    const mx = x.reduce((a, b) => a + b, 0) / n
    const my = y.reduce((a, b) => a + b, 0) / n
    let sxy = 0
    let sxx = 0
    for (let i = 0; i < n; i++) {
      sxy += (x[i] - mx) * (y[i] - my)
      sxx += (x[i] - mx) ** 2
    }
    const slope = sxx ? sxy / sxx : 0
    return [my - slope * mx, slope]
  }
  if (w.cells.ix.length < 2) {
    const dLat = w.grid.dxKm / 110.574
    const dLon = w.grid.dxKm / (111.32 * Math.cos((w.grid.originLat * Math.PI) / 180))
    return { lon0: w.grid.originLon, dLon, lat0: w.grid.originLat, dLat }
  }
  const [lon0, dLon] = fit(w.cells.ix, w.cells.lon)
  const [lat0, dLat] = fit(w.cells.iy, w.cells.lat)
  return { lon0, dLon, lat0, dLat }
}

export function decodeWindObs(w: WindObsWire): WindObs {
  const axis = axisOf(w)
  return {
    axis,
    stations: w.stations.map((s) => {
      const kn = toFloat(s.kn, axis.n)
      const fromDeg = toFloat(s.fromDeg, axis.n)
      // Calm (0 kn, no direction) is a real reading: u = v = 0.
      const comp = (f: (a: number) => number) =>
        kn.map((speed, i) => (Number.isFinite(speed) ? (speed === 0 ? 0 : -speed * f((fromDeg[i] * Math.PI) / 180)) : NaN))
      return {
        id: s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        kn,
        fromDeg,
        gustKn: s.gustKn ? toFloat(s.gustKn, axis.n) : null,
        u: comp(Math.sin),
        v: comp(Math.cos),
      }
    }),
  }
}

export function decodeOcean(w: OceanWire): Ocean {
  const axis = axisOf(w)
  return {
    axis,
    parts: w.parts,
    layers: w.layers.map((l) => {
      const cells = l.grid.nLat * l.grid.nLon
      return {
        id: l.id,
        label: l.label,
        resolutionKm: l.resolutionKm,
        grid: l.grid,
        // cm/s → m/s
        u: grid(l.u, axis.n, cells, 0.01),
        v: grid(l.v, axis.n, cells, 0.01),
      }
    }),
  }
}

export function decodeProfiles(w: ProfilesWire): Profiles {
  const axis = axisOf(w)
  return {
    axis,
    nodes: w.nodes.map((n) => ({
      code: n.code,
      name: n.name,
      lat: n.lat,
      lon: n.lon,
      depthM: n.depthM,
      binDepthM: n.binDepthM,
      u: grid(n.u, axis.n, n.binDepthM.length),
      v: grid(n.v, axis.n, n.binDepthM.length),
    })),
  }
}

export function decodeTraffic(w: TrafficWire): Traffic {
  const t0 = Date.parse(w.t0)
  return {
    vessels: w.vessels.map((v) => {
      const nan = (col: (number | null)[]) => Float32Array.from(col, (x) => (x === null ? NaN : x))
      return {
        mmsi: v.mmsi,
        name: v.name?.trim() || `MMSI ${v.mmsi}`,
        callsign: v.callsign,
        group: AIS_GROUPS.includes(w.groups[v.group] as (typeof AIS_GROUPS)[number])
          ? (w.groups[v.group] as (typeof AIS_GROUPS)[number])
          : 'unknown',
        type: v.type,
        lengthM: v.lengthM,
        role: v.role,
        t: Float64Array.from(v.t, (s) => t0 + s * 1000),
        lat: Float64Array.from(v.lat),
        lon: Float64Array.from(v.lon),
        sogKn: nan(v.sogKn),
        cogDeg: nan(v.cogDeg),
        hdgDeg: nan(v.hdgDeg),
      }
    }),
  }
}

export function decodeClimatology(w: ClimatologyWire): Climatology {
  return {
    years: w.years,
    nBins: w.nBins,
    vars: Object.fromEntries(
      Object.entries(w.vars).map(([k, v]) => [
        k,
        { mean: toFloat(v.mean, w.nBins), p10: toFloat(v.p10, w.nBins), p90: toFloat(v.p90, w.nBins), n: toFloat(v.n, w.nBins) },
      ]),
    ),
  }
}

export function decodeFouling(w: FoulingWire): Fouling {
  const cells = w.grid.nLat * w.grid.nLon
  return {
    date: w.date,
    status: w.status,
    grid: w.grid,
    score: toFloat(w.score, cells),
    spread: toFloat(w.spread, cells),
    cover: Uint8Array.from({ length: cells }, (_, k) => w.cover[k] ?? 0),
  }
}
