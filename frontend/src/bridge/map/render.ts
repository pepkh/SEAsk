import { rampColor } from '../../screens/Lab/trackColour'
import type { TrackKey } from '../BridgeProvider'
import type { DayData, ShipDay } from '../model'
import { AIS_CLASS, type Palette } from '../palette'
import { angleAt, valueAt } from '../series'
import { vesselAt } from '../traffic'
import { metresPerPixel, project, type View } from './mercator'

/* Canvas drawing of the own-ship track and of every vessel. */

/** Colour range of each track reading (values outside use the end colours). */
export const TRACK_RANGE: Record<TrackKey, { min: number; max: number }> = {
  sstC: { min: 11, max: 18 },
  sal: { min: 24, max: 31 },
  o2Sat: { min: 70, max: 120 },
  chl: { min: 0, max: 5 },
  turb: { min: 0, max: 4 },
  sogKn: { min: 0, max: 22 },
  rollDeg: { min: 0, max: 4 },
}

/** The day's track so far (faint) and the current or last crossing up to `t`, coloured by a reading. */
export function drawTrack(ctx: CanvasRenderingContext2D, view: View, ship: ShipDay, t: number, key: TrackKey, pal: Palette) {
  const { axis, c } = ship
  const last = Math.min(axis.n - 1, Math.floor((t - axis.t0) / axis.stepMs))
  if (last < 1) return

  // Day so far, every minute.
  ctx.beginPath()
  let pen = false
  for (let i = 0; i <= last; i += 6) {
    const lat = c.lat[i]
    const lon = c.lon[i]
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      pen = false
      continue
    }
    const [x, y] = project(view, lat, lon)
    if (pen) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
    pen = true
  }
  ctx.strokeStyle = pal.night ? 'rgba(255,74,61,0.25)' : 'rgba(230,237,240,0.22)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 4])
  ctx.stroke()
  ctx.setLineDash([])

  // Current crossing, or the last one before `t`.
  const crossing = [...ship.crossings].reverse().find((x) => x.start <= t)
  if (!crossing) return
  const i0 = Math.max(0, Math.floor((crossing.start - axis.t0) / axis.stepMs))
  const i1 = Math.min(last, Math.floor((crossing.end - axis.t0) / axis.stepMs))
  const range = TRACK_RANGE[key]
  const pts: [number, number, number][] = []
  for (let i = i0; i <= i1; i += 2) {
    const lat = c.lat[i]
    const lon = c.lon[i]
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const [x, y] = project(view, lat, lon)
    const raw = c[key][i]
    pts.push([x, y, key === 'rollDeg' ? Math.abs(raw) : raw])
  }
  if (pts.length < 2) return
  // Casing under the coloured line, so dark ramp colours still read on the dark map.
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.strokeStyle = pal.casing
  ctx.lineWidth = 7
  ctx.stroke()
  ctx.lineWidth = 4
  for (let i = 1; i < pts.length; i++) {
    const v = pts[i][2]
    ctx.strokeStyle = Number.isFinite(v) ? (pal.night ? nightRamp(v, range) : rampColor(v, range)) : pal.muted
    ctx.beginPath()
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1])
    ctx.lineTo(pts[i][0], pts[i][1])
    ctx.stroke()
  }
}

function nightRamp(v: number, r: { min: number; max: number }): string {
  const k = Math.min(1, Math.max(0, (v - r.min) / (r.max - r.min)))
  return `rgb(${Math.round(90 + 165 * k)},${Math.round(10 + 64 * k)},${Math.round(8 + 53 * k)})`
}

/** A hull shape pointing up, `len` px long. Ferries are long boxes, others a narrow arrow. */
function hull(ctx: CanvasRenderingContext2D, x: number, y: number, deg: number, len: number, kind: 'arrow' | 'ferry') {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.beginPath()
  if (kind === 'ferry') {
    const w = len * 0.32
    ctx.moveTo(0, -len / 2)
    ctx.lineTo(w / 2, -len / 4)
    ctx.lineTo(w / 2, len / 2)
    ctx.lineTo(-w / 2, len / 2)
    ctx.lineTo(-w / 2, -len / 4)
  } else {
    ctx.moveTo(0, -len / 2)
    ctx.lineTo(len * 0.3, len / 2)
    ctx.lineTo(0, len * 0.3)
    ctx.lineTo(-len * 0.3, len / 2)
  }
  ctx.closePath()
  ctx.restore()
}

/** A course-over-ground vector: where the vessel will be in `minutes`. */
function vector(ctx: CanvasRenderingContext2D, view: View, lat: number, lon: number, sogKn: number, cogDeg: number, minutes: number) {
  if (!Number.isFinite(sogKn) || !Number.isFinite(cogDeg) || sogKn < 0.5) return
  const metres = sogKn * 1852 * (minutes / 60)
  const px = metres / metresPerPixel(view, lat)
  const [x, y] = project(view, lat, lon)
  const a = (cogDeg * Math.PI) / 180
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + Math.sin(a) * px, y - Math.cos(a) * px)
  ctx.stroke()
}

export interface Hit {
  kind: 'vessel' | 'own' | 'twdp'
  mmsi: number | null
  x: number
  y: number
}

/** Draws every vessel at the exact time `t` (called every frame). Returns their screen positions. */
export function drawVessels(ctx: CanvasRenderingContext2D, view: View, day: DayData, t: number, pal: Palette, selected: number | null, cpaLine: { lat: number; lon: number } | null): Hit[] {
  const hits: Hit[] = []
  const ownLat = day.ship ? valueAt(day.ship.axis, day.ship.c.lat, t) : NaN
  const ownLon = day.ship ? valueAt(day.ship.axis, day.ship.c.lon, t) : NaN

  // AIS targets.
  if (day.traffic) {
    for (const v of day.traffic.vessels) {
      if (v.role === 'own' || v.role === 'twdp') continue
      const now = vesselAt(v, t)
      if (!now) continue
      const [x, y] = project(view, now.lat, now.lon)
      if (x < -20 || y < -20 || x > view.w + 20 || y > view.h + 20) continue
      const color = pal.ais[AIS_CLASS[v.group]]
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      vector(ctx, view, now.lat, now.lon, now.sogKn, now.cogDeg, 6)
      const heading = Number.isFinite(now.hdgDeg) ? now.hdgDeg : Number.isFinite(now.cogDeg) ? now.cogDeg : 0
      hull(ctx, x, y, heading, v.mmsi === selected ? 18 : 13, AIS_CLASS[v.group] === 'passenger' ? 'ferry' : 'arrow')
      if (now.stale) {
        ctx.lineWidth = 1.5
        ctx.stroke()
      } else {
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = pal.casing
        ctx.lineWidth = 1
        ctx.stroke()
      }
      if (v.mmsi === selected) {
        ctx.strokeStyle = pal.ink
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(x, y, 16, 0, Math.PI * 2)
        ctx.stroke()
      }
      hits.push({ kind: 'vessel', mmsi: v.mmsi, x, y })
    }
  }

  // The other ONC ferry (Tsawwassen–Duke Point), with a halo and a label.
  const tw = day.stations?.twdp
  if (tw?.c.lat && tw.c.lon) {
    const lat = valueAt(tw.axis, tw.c.lat, t)
    const lon = valueAt(tw.axis, tw.c.lon, t)
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const [x, y] = project(view, lat, lon)
      const hdg = tw.c.hdgDeg ? angleAt(tw.axis, tw.c.hdgDeg, t) : 0
      ctx.fillStyle = pal.night ? 'rgba(255,74,61,0.18)' : 'rgba(217,89,38,0.22)'
      ctx.beginPath()
      ctx.arc(x, y, 18, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = pal.ais.passenger
      ctx.lineWidth = 1.5
      vector(ctx, view, lat, lon, tw.c.sogKn ? valueAt(tw.axis, tw.c.sogKn, t) : NaN, tw.c.cogDeg ? angleAt(tw.axis, tw.c.cogDeg, t) : NaN, 6)
      hull(ctx, x, y, Number.isFinite(hdg) ? hdg : 0, 22, 'ferry')
      ctx.fillStyle = pal.ais.passenger
      ctx.fill()
      ctx.strokeStyle = pal.casing
      ctx.stroke()
      if (view.zoom >= 9.5) label(ctx, 'TWDP ferry', x + 16, y - 14, pal)
      hits.push({ kind: 'twdp', mmsi: null, x, y })
    }
  }

  // CPA line to the selected or most dangerous target.
  if (cpaLine && Number.isFinite(ownLat)) {
    const [x0, y0] = project(view, ownLat, ownLon)
    const [x1, y1] = project(view, cpaLine.lat, cpaLine.lon)
    ctx.strokeStyle = pal.critical
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 5])
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Own ship last, on top.
  if (day.ship && Number.isFinite(ownLat) && Number.isFinite(ownLon)) {
    const { axis, c } = day.ship
    const [x, y] = project(view, ownLat, ownLon)
    const hdg = angleAt(axis, c.hdgDeg, t)
    ctx.strokeStyle = pal.own
    ctx.lineWidth = 2
    vector(ctx, view, ownLat, ownLon, valueAt(axis, c.sogKn, t), angleAt(axis, c.cogDeg, t), 6)
    hull(ctx, x, y, Number.isFinite(hdg) ? hdg : 0, 26, 'ferry')
    ctx.fillStyle = pal.own
    ctx.fill()
    ctx.strokeStyle = pal.casing
    ctx.lineWidth = 2
    ctx.stroke()
    hits.push({ kind: 'own', mmsi: null, x, y })
  }
  return hits
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, pal: Palette) {
  ctx.font = '500 12px "JetBrains Mono", ui-monospace, monospace'
  ctx.lineWidth = 3
  ctx.strokeStyle = pal.casing
  ctx.strokeText(text, x, y)
  ctx.fillStyle = pal.ink
  ctx.fillText(text, x, y)
}

export type Layer = 'base' | 'field' | 'size' | 'track' | 'top'

/** Which canvases need a redraw. Marked by events and data changes; taken (and cleared) by the frame loop. */
export class DirtyFlags {
  private flags: Record<Layer, boolean> = { base: true, field: true, size: true, track: true, top: true }

  mark(...layers: Layer[]) {
    for (const l of layers) this.flags[l] = true
  }

  /** True if the layer needed a redraw; clears it. */
  take(layer: Layer): boolean {
    const was = this.flags[layer]
    this.flags[layer] = false
    return was
  }
}
