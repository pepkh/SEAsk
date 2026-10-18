/*
 * Offline map tiles for map mode. scripts/download-tiles.ts writes them; src/map reads them.
 * Layout: {VITE_TILES_URL}/{dir}/{z}/{x}/{y}.{ext} (Web Mercator XYZ).
 */

// With the extension: scripts/download-tiles.ts imports this file in Node.
import { SOURCES } from './sources.ts'

export interface Area {
  west: number
  south: number
  east: number
  north: number
}

/** Route area: all zoom levels up to the layer maximum. */
export const ROUTE_AREA: Area = { west: -123.6, south: 48.6, east: -122.95, north: 49.1 }
/** Wider area for distant views: zoom 0–10 only. */
export const CONTEXT_AREA: Area = { west: -124.2, south: 48.2, east: -122.4, north: 49.5 }
export const CONTEXT_MAX_ZOOM = 10
/** The Salish Sea and the open Pacific off Vancouver Island (the bridge map zoomed out): zoom 0–8 only. */
export const OCEAN_AREA: Area = { west: -129.5, south: 47.0, east: -122.0, north: 51.0 }
export const OCEAN_MAX_ZOOM = 8

export interface TileLayer {
  dir: string
  ext: 'jpg' | 'png'
  maxZoom: number
  credit: string
  /** Short form for the corner of the map; the full credit shows on tap */
  short?: string
}

export const TILE_LAYERS = {
  sentinel: {
    dir: 'sentinel',
    ext: 'jpg',
    maxZoom: 14,
    credit: SOURCES.eox.credit.en,
    short: SOURCES.eox.short.en,
  },
  // The NRCan tile cache stops at zoom 15 (zoom 16 returns 404).
  nrcanMap: {
    dir: 'nrcan/map',
    ext: 'jpg',
    maxZoom: 15,
    credit: SOURCES.nrcan.credit.en,
    short: SOURCES.nrcan.short.en,
  },
  nrcanLabelsEn: { dir: 'nrcan/labels-en', ext: 'png', maxZoom: 15, credit: '' },
  nrcanLabelsFr: { dir: 'nrcan/labels-fr', ext: 'png', maxZoom: 15, credit: '' },
} satisfies Record<string, TileLayer>

export type TileLayerId = keyof typeof TILE_LAYERS

export const TERRAIN_DIR = 'terrain'
export const TERRAIN_CREDIT = SOURCES.mrdem.credit.en
export const TERRAIN_SHORT_CREDIT = SOURCES.mrdem.short.en
