import { CONTEXT_AREA, CONTEXT_MAX_ZOOM, OCEAN_AREA, OCEAN_MAX_ZOOM, ROUTE_AREA, type Area, type TileLayer } from '../../config/tiles'
import { TILES_URL } from '../../config/env'
import { lonToX, latToY, worldPx, TILE_PX, type View } from './mercator'

/*
 * The offline XYZ tiles in public/tiles (scripts/download-tiles.ts), drawn on a canvas. Only tiles the
 * download covers are requested; a missing tile is drawn from the nearest loaded parent.
 */

type Entry = ImageBitmap | 'loading' | 'missing'

const MAX_BITMAPS = 320
const MAX_PARALLEL = 8
/** How many zoom levels up to look for a parent tile. */
const PARENT_LEVELS = 6

function touches(area: Area, z: number, x: number, y: number): boolean {
  const n = 2 ** z
  const ax0 = Math.floor(lonToX(area.west) * n)
  const ax1 = Math.floor(lonToX(area.east) * n)
  const ay0 = Math.floor(latToY(area.north) * n)
  const ay1 = Math.floor(latToY(area.south) * n)
  return x >= ax0 && x <= ax1 && y >= ay0 && y <= ay1
}

/** True when scripts/download-tiles.ts fetched this tile. */
export function covered(layer: TileLayer, z: number, x: number, y: number): boolean {
  if (z <= OCEAN_MAX_ZOOM && touches(OCEAN_AREA, z, x, y)) return true
  if (z <= CONTEXT_MAX_ZOOM && touches(CONTEXT_AREA, z, x, y)) return true
  return z <= layer.maxZoom && touches(ROUTE_AREA, z, x, y)
}

export class TileCache {
  private entries = new Map<string, Entry>()
  private queue: [string, string][] = []
  private active = 0
  private onLoad: () => void

  constructor(onLoad: () => void) {
    this.onLoad = onLoad
  }

  private key = (layer: TileLayer, z: number, x: number, y: number) => `${layer.dir}/${z}/${x}/${y}`

  /** The tile's bitmap, or undefined while it loads (the load is started) or when it is missing. */
  get(layer: TileLayer, z: number, x: number, y: number, request = true): ImageBitmap | undefined {
    const key = this.key(layer, z, x, y)
    const entry = this.entries.get(key)
    if (entry instanceof ImageBitmap) {
      // Most recently used goes to the end of the map (LRU order).
      this.entries.delete(key)
      this.entries.set(key, entry)
      return entry
    }
    if (entry === undefined && request && covered(layer, z, x, y)) {
      this.entries.set(key, 'loading')
      this.queue.push([key, `${TILES_URL}/${key}.${layer.ext}`])
      this.pump()
    }
    return undefined
  }

  private pump() {
    while (this.active < MAX_PARALLEL && this.queue.length) {
      const [key, url] = this.queue.pop()!
      this.active++
      load(url)
        .then((bitmap) => {
          this.entries.set(key, bitmap ?? 'missing')
          this.prune()
          if (bitmap) this.onLoad()
        })
        .finally(() => {
          this.active--
          this.pump()
        })
    }
  }

  private prune() {
    let bitmaps = 0
    for (const e of this.entries.values()) if (e instanceof ImageBitmap) bitmaps++
    for (const [key, e] of this.entries) {
      if (bitmaps <= MAX_BITMAPS) break
      if (e instanceof ImageBitmap) {
        e.close()
        this.entries.delete(key)
        bitmaps--
      }
    }
  }

  /** Forget queued requests (the view moved on). */
  clearQueue() {
    for (const [key] of this.queue) this.entries.delete(key)
    this.queue = []
  }

  dispose() {
    this.clearQueue()
    for (const e of this.entries.values()) if (e instanceof ImageBitmap) e.close()
    this.entries.clear()
  }
}

async function load(url: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url)
    // The Vite dev server answers a missing file with 200 and the HTML page.
    if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) return null
    return await createImageBitmap(await res.blob())
  } catch {
    return null
  }
}

/** The tile zoom level for a view: one level sharper on high-density screens. */
export function tileZoom(view: View, layer: TileLayer, dpr: number): number {
  return Math.max(0, Math.min(layer.maxZoom, Math.round(view.zoom + (dpr > 1.5 ? 0.6 : 0))))
}

/**
 * Draws one tile layer. Returns false while some tiles are still loading. Missing tiles use the
 * matching part of the nearest loaded parent tile.
 */
export function drawTiles(ctx: CanvasRenderingContext2D, view: View, layer: TileLayer, cache: TileCache, dpr: number): boolean {
  const z = tileZoom(view, layer, dpr)
  const n = 2 ** z
  const scale = worldPx(view.zoom) / n // CSS px per tile
  const left = view.cx - view.w / 2 / worldPx(view.zoom)
  const top = view.cy - view.h / 2 / worldPx(view.zoom)
  const x0 = Math.max(0, Math.floor(left * n))
  const y0 = Math.max(0, Math.floor(top * n))
  const x1 = Math.min(n - 1, Math.floor((left + view.w / worldPx(view.zoom)) * n))
  const y1 = Math.min(n - 1, Math.floor((top + view.h / worldPx(view.zoom)) * n))
  let complete = true

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // Snap to device pixels and overlap half a pixel so no seams show.
      const sx = Math.floor(((x / n - left) * worldPx(view.zoom)) * dpr) / dpr
      const sy = Math.floor(((y / n - top) * worldPx(view.zoom)) * dpr) / dpr
      const size = Math.ceil(scale * dpr + 1) / dpr
      const bitmap = cache.get(layer, z, x, y)
      if (bitmap) {
        ctx.drawImage(bitmap, sx, sy, size, size)
        continue
      }
      if (covered(layer, z, x, y)) complete = false
      for (let up = 1; up <= Math.min(PARENT_LEVELS, z); up++) {
        const parent = cache.get(layer, z - up, x >> up, y >> up, up === 1)
        if (!parent) continue
        const part = TILE_PX / 2 ** up
        const px = (x - ((x >> up) << up)) * part
        const py = (y - ((y >> up) << up)) * part
        ctx.drawImage(parent, px, py, part, part, sx, sy, size, size)
        break
      }
    }
  }
  return complete
}
