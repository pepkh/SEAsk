/*
 * Regular time series. A dataset has one axis (t0, step, n) and several columns as Float32Array,
 * with NaN for a missing value, so the value at any time is an index away (no search).
 */

export interface Axis {
  /** Epoch ms of frame 0 */
  t0: number
  stepMs: number
  n: number
}

/** A column on its axis. */
export interface Series {
  axis: Axis
  v: Float32Array
}

export function axisOf(wire: { t0: string; stepS: number; n: number }): Axis {
  return { t0: Date.parse(wire.t0), stepMs: wire.stepS * 1000, n: wire.n }
}

/** Wire column → Float32Array (null → NaN). */
export function toFloat(col: readonly (number | null)[] | undefined, n: number): Float32Array {
  const out = new Float32Array(n).fill(NaN)
  if (!col) return out
  for (let i = 0; i < Math.min(n, col.length); i++) {
    const v = col[i]
    if (v !== null && v !== undefined) out[i] = v
  }
  return out
}

/** End of the axis (time of the frame after the last). */
export const axisEnd = (a: Axis) => a.t0 + a.n * a.stepMs

/** Fractional frame index of `t`. */
export const frameOf = (a: Axis, t: number) => (t - a.t0) / a.stepMs

/** Frame index nearest to `t`, or -1 outside the axis. */
export function indexAt(a: Axis, t: number): number {
  const i = Math.round(frameOf(a, t))
  return i >= 0 && i < a.n ? i : -1
}

/**
 * Value at `t`: linear between the two frames around it. When the next frame is missing the value
 * holds until it (live data fills the newest frame and nothing after it yet); when only the next one
 * is there, it is used from half a frame before. NaN outside the axis or in a gap.
 */
export function valueAt(a: Axis, v: Float32Array, t: number): number {
  const f = frameOf(a, t)
  if (f < -0.5 || f > a.n - 0.5) return NaN
  const i = Math.floor(f)
  const k = f - i
  const lo = i >= 0 ? v[i] : NaN
  const hi = i + 1 < a.n ? v[i + 1] : NaN
  if (Number.isFinite(lo) && Number.isFinite(hi)) return lo + (hi - lo) * k
  if (Number.isFinite(lo)) return lo
  return k >= 0.5 && Number.isFinite(hi) ? hi : NaN
}

/** Angle (degrees) at `t`, turning the short way round between frames. */
export function angleAt(a: Axis, v: Float32Array, t: number): number {
  const f = frameOf(a, t)
  if (f < -0.5 || f > a.n - 0.5) return NaN
  const i = Math.floor(f)
  const k = f - i
  const lo = i >= 0 ? v[i] : NaN
  const hi = i + 1 < a.n ? v[i + 1] : NaN
  if (Number.isFinite(lo) && Number.isFinite(hi)) {
    const d = ((hi - lo + 540) % 360) - 180
    return (lo + d * k + 360) % 360
  }
  if (Number.isFinite(lo)) return lo
  return k >= 0.5 && Number.isFinite(hi) ? hi : NaN
}

/** The last value at or before `t` within `maxBackMs`, with its time; null when there is none. */
export function lastAt(a: Axis, v: Float32Array, t: number, maxBackMs: number): { value: number; t: number } | null {
  const last = Math.min(a.n - 1, Math.floor(frameOf(a, t)))
  const first = Math.max(0, Math.ceil(frameOf(a, t - maxBackMs)))
  for (let i = last; i >= first; i--) {
    if (Number.isFinite(v[i])) return { value: v[i], t: a.t0 + i * a.stepMs }
  }
  return null
}

/** Mean, min or max of the values between two times (NaN without values). */
export function windowStat(a: Axis, v: Float32Array, from: number, to: number, stat: 'mean' | 'min' | 'max'): number {
  const i0 = Math.max(0, Math.ceil(frameOf(a, from)))
  const i1 = Math.min(a.n - 1, Math.floor(frameOf(a, to)))
  let sum = 0
  let count = 0
  let lo = Infinity
  let hi = -Infinity
  for (let i = i0; i <= i1; i++) {
    const x = v[i]
    if (!Number.isFinite(x)) continue
    sum += x
    count++
    if (x < lo) lo = x
    if (x > hi) hi = x
  }
  if (!count) return NaN
  return stat === 'mean' ? sum / count : stat === 'min' ? lo : hi
}

/** Smallest and largest value of a column (NaN, NaN when empty). */
export function extent(v: Float32Array): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const x of v) {
    if (!Number.isFinite(x)) continue
    if (x < lo) lo = x
    if (x > hi) hi = x
  }
  return lo <= hi ? [lo, hi] : [NaN, NaN]
}
