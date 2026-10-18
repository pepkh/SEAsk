import { unproject, type View } from './mercator'

import { LOW_FX } from '../../config/env'

/*
 * Moving-water and moving-air layers. A field (CODAR currents or model wind) is sampled once onto a
 * screen-space grid every few pixels; the colour layer and thousands of particles then read that grid,
 * so a frame costs no geographic maths.
 */

/** Colour-scale top (kn), particle speed (px per frame per field unit) and unit → kn of each field. */
export const FIELD_SCALE = {
  currents: { maxKn: 4, pxPerUnit: 3, toKn: 3600 / 1852 },
  wind: { maxKn: 25, pxPerUnit: 0.16, toKn: 1 },
} as const

export interface VectorGrid {
  cell: number
  cols: number
  rows: number
  /** Toward east / north, in the field's own unit */
  u: Float32Array
  v: Float32Array
  /** Speed in knots (NaN outside the field) */
  kn: Float32Array
}

/** Samples `sample(lat, lon) → [east, north]` on a grid of `cell` CSS px over the view. */
export function buildGrid(view: View, sample: (lat: number, lon: number) => [number, number] | null, toKn: number, cell = 8): VectorGrid {
  const cols = Math.ceil(view.w / cell) + 1
  const rows = Math.ceil(view.h / cell) + 1
  const u = new Float32Array(cols * rows).fill(NaN)
  const v = new Float32Array(cols * rows).fill(NaN)
  const kn = new Float32Array(cols * rows).fill(NaN)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const [lat, lon] = unproject(view, i * cell, j * cell)
      const s = sample(lat, lon)
      if (!s) continue
      const k = j * cols + i
      u[k] = s[0]
      v[k] = s[1]
      kn[k] = Math.hypot(s[0], s[1]) * toKn
    }
  }
  return { cell, cols, rows, u, v, kn }
}

/** Bilinear grid lookup at screen (x, y); null where any corner is outside the field. */
function at(g: VectorGrid, x: number, y: number): [number, number, number] | null {
  const fx = x / g.cell
  const fy = y / g.cell
  const i = Math.floor(fx)
  const j = Math.floor(fy)
  if (i < 0 || j < 0 || i >= g.cols - 1 || j >= g.rows - 1) return null
  const a = j * g.cols + i
  const b = a + 1
  const c = a + g.cols
  const d = c + 1
  if (!(Number.isFinite(g.u[a]) && Number.isFinite(g.u[b]) && Number.isFinite(g.u[c]) && Number.isFinite(g.u[d]))) return null
  const kx = fx - i
  const ky = fy - j
  const mix = (arr: Float32Array) => (arr[a] * (1 - kx) + arr[b] * kx) * (1 - ky) + (arr[c] * (1 - kx) + arr[d] * kx) * ky
  return [mix(g.u), mix(g.v), mix(g.kn)]
}

/** Draws the speed colour field (one smoothed image, scaled by the GPU). */
export function drawField(ctx: CanvasRenderingContext2D, g: VectorGrid, table: Uint8ClampedArray, maxKn: number, scratch: HTMLCanvasElement) {
  scratch.width = g.cols
  scratch.height = g.rows
  const sctx = scratch.getContext('2d')!
  const img = sctx.createImageData(g.cols, g.rows)
  for (let k = 0; k < g.kn.length; k++) {
    const s = g.kn[k]
    if (!Number.isFinite(s)) continue
    const i = Math.max(0, Math.min(255, Math.round((s / maxKn) * 255))) * 4
    img.data.set(table.subarray(i, i + 4), k * 4)
  }
  sctx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(scratch, 0, 0, g.cols, g.rows, 0, 0, g.cols * g.cell, g.rows * g.cell)
}

/** Static arrows instead of particles (reduced motion): one per `spacing` px, sized by speed. */
export function drawArrows(ctx: CanvasRenderingContext2D, g: VectorGrid, maxKn: number, color: string, spacing = 48) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.5
  for (let y = spacing / 2; y < g.rows * g.cell; y += spacing) {
    for (let x = spacing / 2; x < g.cols * g.cell; x += spacing) {
      const s = at(g, x, y)
      if (!s) continue
      const len = 8 + Math.min(1, s[2] / maxKn) * 16
      const a = Math.atan2(-s[1], s[0])
      const dx = Math.cos(a) * len
      const dy = Math.sin(a) * len
      ctx.beginPath()
      ctx.moveTo(x - dx / 2, y - dy / 2)
      ctx.lineTo(x + dx / 2, y + dy / 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x + dx / 2, y + dy / 2)
      ctx.lineTo(x + dx / 2 - Math.cos(a - 0.5) * 6, y + dy / 2 - Math.sin(a - 0.5) * 6)
      ctx.lineTo(x + dx / 2 - Math.cos(a + 0.5) * 6, y + dy / 2 - Math.sin(a + 0.5) * 6)
      ctx.fill()
    }
  }
}

const BUCKETS = 6

/** Windy-style particles: they drift with the field and leave fading trails. */
export class Particles {
  private x = new Float32Array(0)
  private y = new Float32Array(0)
  private age = new Float32Array(0)
  private maxAge = new Float32Array(0)
  private w = 0
  private h = 0

  resize(w: number, h: number) {
    this.w = w
    this.h = h
    // About one per 350 px², at most 3000: enough to read the flow, cheap on kiosk hardware.
    const n = Math.min(LOW_FX ? 1500 : 3000, Math.round((w * h) / (LOW_FX ? 600 : 350)))
    this.x = new Float32Array(n)
    this.y = new Float32Array(n)
    this.age = new Float32Array(n)
    this.maxAge = new Float32Array(n)
    for (let i = 0; i < n; i++) this.spawn(i, Math.random() * 90)
  }

  private spawn(i: number, age = 0) {
    this.x[i] = Math.random() * this.w
    this.y[i] = Math.random() * this.h
    this.age[i] = age
    this.maxAge[i] = 60 + Math.random() * 40
  }

  /**
   * Moves every particle one frame and draws the trail segments. `pxPerUnit` turns the field unit
   * into screen pixels per frame (constant on screen, as on Windy, whatever the zoom).
   */
  step(ctx: CanvasRenderingContext2D, g: VectorGrid, pxPerUnit: number, maxKn: number, rgb: [number, number, number]) {
    // Fade the old trails.
    ctx.globalCompositeOperation = 'destination-in'
    ctx.fillStyle = 'rgba(0,0,0,0.9)'
    ctx.fillRect(0, 0, this.w, this.h)
    ctx.globalCompositeOperation = 'source-over'

    const paths = Array.from({ length: BUCKETS }, () => new Path2D())
    for (let i = 0; i < this.x.length; i++) {
      const s = at(g, this.x[i], this.y[i])
      if (!s || ++this.age[i] > this.maxAge[i]) {
        this.spawn(i)
        continue
      }
      const nx = this.x[i] + s[0] * pxPerUnit
      const ny = this.y[i] - s[1] * pxPerUnit
      const b = Math.min(BUCKETS - 1, Math.floor((s[2] / maxKn) * BUCKETS))
      paths[b].moveTo(this.x[i], this.y[i])
      paths[b].lineTo(nx, ny)
      this.x[i] = nx
      this.y[i] = ny
    }
    ctx.lineWidth = 1.4
    ctx.lineCap = 'round'
    for (let b = 0; b < BUCKETS; b++) {
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.35 + (0.6 * b) / (BUCKETS - 1)).toFixed(2)})`
      ctx.stroke(paths[b])
    }
  }

  clear(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, this.w, this.h)
  }
}
