import type { AisGroup } from '../types/bridge'

/*
 * Colours for the canvas layers. Text and chrome use the CSS tokens in bridgeTheme.css; canvases
 * cannot read CSS variables cheaply per frame, so they get this object, rebuilt when night mode
 * changes.
 *
 * Fields are single-hue lightness ramps (one field at a time, legend always on): blue for currents,
 * orange for wind, violet for the biofouling index (monotone, 8° hue spread; checked on #0B1418; its
 * scores sit in 25-85, so most of its lightness is spent there).
 * Low values fade into the map, high values are light. AIS uses three validated
 * categorical slots (blue, orange, aqua; checked on #0B1418, all pairs) plus grey, with the hull
 * shape as a second cue.
 */

export type AisClass = 'cargo' | 'passenger' | 'service' | 'other'

export const AIS_CLASS: Record<AisGroup, AisClass> = {
  cargo: 'cargo',
  tanker: 'cargo',
  passenger: 'passenger',
  hsc: 'passenger',
  tug: 'service',
  fishing: 'service',
  special: 'service',
  pleasure: 'other',
  sailing: 'other',
  other: 'other',
  unknown: 'other',
}

export interface Palette {
  night: boolean
  /** Canvas filter for the tiles (drawn once per redraw, not composited every frame) */
  tileFilter: { satellite: string; chart: string }
  ink: string
  ink2: string
  muted: string
  surface: string
  own: string
  casing: string
  ais: Record<AisClass, string>
  critical: string
  particle: [number, number, number]
  /** 256 × RGBA lookup tables, value 0 → 255 */
  currentLut: Uint8ClampedArray
  windLut: Uint8ClampedArray
  foulingLut: Uint8ClampedArray
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))

/** Lookup table through colour stops, alpha rising from `a0` to `a1`. */
function lut(stops: string[], a0: number, a1: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(256 * 4)
  const rgb = stops.map(hex)
  for (let i = 0; i < 256; i++) {
    const k = (i / 255) * (rgb.length - 1)
    const j = Math.min(rgb.length - 2, Math.floor(k))
    const f = k - j
    for (let c = 0; c < 3; c++) out[i * 4 + c] = rgb[j][c] + (rgb[j + 1][c] - rgb[j][c]) * f
    out[i * 4 + 3] = 255 * (a0 + (a1 - a0) * Math.sqrt(i / 255))
  }
  return out
}

const DAY: Palette = {
  night: false,
  tileFilter: {
    satellite: 'brightness(0.62) saturate(0.75) contrast(1.05)',
    chart: 'invert(1) hue-rotate(180deg) brightness(0.78) contrast(0.92) saturate(0.6)',
  },
  ink: '#E6EDF0',
  ink2: '#9FB0B8',
  muted: '#6E8088',
  surface: '#0B1418',
  own: '#FFFFFF',
  casing: 'rgba(7, 13, 16, 0.85)',
  ais: { cargo: '#3987e5', passenger: '#d95926', service: '#199e70', other: '#8A989E' },
  critical: '#d03b3b',
  particle: [235, 244, 248],
  currentLut: lut(['#0d366b', '#1c5cab', '#3987e5', '#86b6ef', '#cde2fb'], 0.05, 0.62),
  windLut: lut(['#5a2208', '#a8441b', '#d95926', '#f19a6f', '#fbd2bd'], 0.05, 0.55),
  foulingLut: lut(['#1d1650', '#2a2070', '#4a3cb0', '#7a6be0', '#b3aaf2', '#ecebfd'], 0.1, 0.78),
}

const NIGHT: Palette = {
  night: true,
  tileFilter: {
    satellite: 'grayscale(1) brightness(0.32) sepia(1) hue-rotate(-50deg) saturate(4)',
    chart: 'invert(1) grayscale(1) brightness(0.4) sepia(1) hue-rotate(-50deg) saturate(4)',
  },
  ink: '#FF4A3D',
  ink2: '#C2362B',
  muted: '#8A2A22',
  surface: '#050000',
  own: '#FF6A5E',
  casing: 'rgba(0, 0, 0, 0.9)',
  ais: { cargo: '#C2362B', passenger: '#FF4A3D', service: '#9E2B22', other: '#6E1E18' },
  critical: '#FF4A3D',
  particle: [255, 90, 78],
  currentLut: lut(['#1a0000', '#4a0703', '#8a1a12', '#c2362b', '#ff6a5e'], 0.05, 0.6),
  windLut: lut(['#1a0000', '#4a0703', '#8a1a12', '#c2362b', '#ff6a5e'], 0.05, 0.6),
  foulingLut: lut(['#1a0000', '#4a0703', '#8a1a12', '#c2362b', '#ff6a5e'], 0.1, 0.6),
}

export const paletteFor = (night: boolean): Palette => (night ? NIGHT : DAY)

const FIELD_LUT = { currents: 'currentLut', wind: 'windLut', fouling: 'foulingLut' } as const

/** The colour table of a map field. */
export const fieldLut = (pal: Palette, layer: keyof typeof FIELD_LUT) => pal[FIELD_LUT[layer]]

/** rgba() of a lookup-table entry for a value scaled 0..1. */
export function lutColor(table: Uint8ClampedArray, k: number, alpha?: number): string {
  const i = Math.max(0, Math.min(255, Math.round(k * 255))) * 4
  return `rgba(${table[i]},${table[i + 1]},${table[i + 2]},${alpha ?? (table[i + 3] / 255).toFixed(3)})`
}
