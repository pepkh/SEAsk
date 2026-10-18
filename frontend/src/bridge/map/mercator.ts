/*
 * Web Mercator for the bridge map. World units run 0..1 across the world (x east, y south);
 * one world is 256 × 2^zoom CSS pixels, as in XYZ tiles.
 */

export const TILE_PX = 256
const RAD = Math.PI / 180

export const lonToX = (lon: number) => (lon + 180) / 360
export function latToY(lat: number): number {
  const s = Math.sin(lat * RAD)
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}
export const xToLon = (x: number) => x * 360 - 180
export const yToLat = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / RAD

/** What the map shows: the centre (world units), the zoom, and the size in CSS pixels. */
export interface View {
  cx: number
  cy: number
  zoom: number
  w: number
  h: number
}

export const worldPx = (zoom: number) => TILE_PX * 2 ** zoom

/** Screen position (CSS px) of a place. */
export function project(view: View, lat: number, lon: number): [number, number] {
  const s = worldPx(view.zoom)
  return [(lonToX(lon) - view.cx) * s + view.w / 2, (latToY(lat) - view.cy) * s + view.h / 2]
}

/** Place at a screen position. */
export function unproject(view: View, sx: number, sy: number): [number, number] {
  const s = worldPx(view.zoom)
  return [yToLat(view.cy + (sy - view.h / 2) / s), xToLon(view.cx + (sx - view.w / 2) / s)]
}

export interface Area {
  west: number
  south: number
  east: number
  north: number
}

/** The view that fits an area in a w × h box with `pad` pixels on each side. */
export function fitArea(area: Area, w: number, h: number, pad = 24): View {
  const x0 = lonToX(area.west)
  const x1 = lonToX(area.east)
  const y0 = latToY(area.north)
  const y1 = latToY(area.south)
  const zx = Math.log2((Math.max(1, w - 2 * pad) / (x1 - x0)) / TILE_PX)
  const zy = Math.log2((Math.max(1, h - 2 * pad) / (y1 - y0)) / TILE_PX)
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, zoom: Math.min(zx, zy), w, h }
}

/** Metres per CSS pixel at a latitude. */
export const metresPerPixel = (view: View, lat: number) => (40_075_016.686 * Math.cos(lat * RAD)) / worldPx(view.zoom)

/** Zoom around a screen point, keeping the place under it still. */
export function zoomAround(view: View, sx: number, sy: number, zoom: number): View {
  const s0 = worldPx(view.zoom)
  const s1 = worldPx(zoom)
  const wx = view.cx + (sx - view.w / 2) / s0
  const wy = view.cy + (sy - view.h / 2) / s0
  return { ...view, zoom, cx: wx - (sx - view.w / 2) / s1, cy: wy - (sy - view.h / 2) / s1 }
}
