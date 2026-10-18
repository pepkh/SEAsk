import type { Axis } from '../../../bridge/series'

/*
 * SVG paths for regular series. Lines break at missing values. With more samples than pixels, each
 * pixel column keeps its min and max (so a short roll spike is never averaged away).
 */

export interface Scale {
  /** Time (ms) → x */
  x: (t: number) => number
  /** Value → y */
  y: (v: number) => number
}

export function linePath(axis: Axis, v: Float32Array, s: Scale, x0: number, x1: number): string {
  const perPx = (axis.stepMs / Math.max(1e-9, s.x(axis.t0 + axis.stepMs) - s.x(axis.t0)))
  if (perPx > 2 * axis.stepMs) return decimated(axis, v, s, x0, x1)
  let d = ''
  let pen = false
  for (let i = 0; i < axis.n; i++) {
    const val = v[i]
    if (!Number.isFinite(val)) {
      pen = false
      continue
    }
    const x = s.x(axis.t0 + i * axis.stepMs)
    if (x < x0 - 2 || x > x1 + 2) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${s.y(val).toFixed(1)}`
    pen = true
  }
  return d
}

function decimated(axis: Axis, v: Float32Array, s: Scale, x0: number, x1: number): string {
  let d = ''
  let col = -1
  let lo = Infinity
  let hi = -Infinity
  let pen = false
  const flush = () => {
    if (col < 0 || lo > hi) return
    const a = s.y(lo).toFixed(1)
    const b = s.y(hi).toFixed(1)
    d += `${pen ? 'L' : 'M'}${col} ${a}${a !== b ? `L${col} ${b}` : ''}`
    pen = true
  }
  for (let i = 0; i < axis.n; i++) {
    const x = Math.round(s.x(axis.t0 + i * axis.stepMs))
    if (x < x0 || x > x1) continue
    if (x !== col) {
      flush()
      col = x
      lo = Infinity
      hi = -Infinity
    }
    const val = v[i]
    if (!Number.isFinite(val)) {
      // A gap: end the line after this column.
      flush()
      pen = false
      lo = Infinity
      hi = -Infinity
      col = -1
      continue
    }
    if (val < lo) lo = val
    if (val > hi) hi = val
  }
  flush()
  return d
}

/** Area between the line and a baseline value (for tide and current washes). */
export function areaPath(axis: Axis, v: Float32Array, s: Scale, base: number): string {
  let d = ''
  let run: [number, number][] = []
  const close = () => {
    if (run.length > 1) {
      const by = s.y(base).toFixed(1)
      d += `M${run[0][0].toFixed(1)} ${by}` + run.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join('') + `L${run[run.length - 1][0].toFixed(1)} ${by}Z`
    }
    run = []
  }
  for (let i = 0; i < axis.n; i++) {
    if (!Number.isFinite(v[i])) {
      close()
      continue
    }
    run.push([s.x(axis.t0 + i * axis.stepMs), s.y(v[i])])
  }
  close()
  return d
}

/** Nice round ticks between lo and hi (about `count`). */
export function ticks(lo: number, hi: number, count = 3): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return []
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step)
  return out
}
