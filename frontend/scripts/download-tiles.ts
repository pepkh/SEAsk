/**
 * Downloads the offline map tiles for map mode into public/tiles/<layer dir>/{z}/{x}/{y}.<ext>.
 * Run once on a machine with internet: node scripts/download-tiles.ts [layer ...]
 * Layers: sentinel, nrcanMap, nrcanLabelsEn, nrcanLabelsFr (default: all).
 * The script skips tiles that are already on disk, so it can run again after an interruption.
 */
import { access, mkdir, writeFile } from 'node:fs/promises'
import {
  CONTEXT_AREA,
  CONTEXT_MAX_ZOOM,
  ROUTE_AREA,
  TILE_LAYERS,
  type Area,
  type TileLayerId,
} from '../src/config/tiles.ts'

const NRCAN = 'https://maps-cartes.services.geo.ca/server2_serveur2/rest/services/BaseMaps'
const SOURCES: Record<TileLayerId, string> = {
  sentinel: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg',
  nrcanMap: `${NRCAN}/CBMT_CBCT_GEOM_3857/MapServer/tile/{z}/{y}/{x}`,
  nrcanLabelsEn: `${NRCAN}/CBMT_TXT_3857/MapServer/tile/{z}/{y}/{x}`,
  nrcanLabelsFr: `${NRCAN}/CBCT_TXT_3857/MapServer/tile/{z}/{y}/{x}`,
}

const OUT = new URL('../public/tiles/', import.meta.url)
const PARALLEL = 4
const RETRIES = 3

/** Web Mercator tile range that covers an area at zoom z. */
function tileRange({ west, south, east, north }: Area, z: number) {
  const n = 2 ** z
  const x = (lon: number) => Math.floor(((lon + 180) / 360) * n)
  const y = (lat: number) => {
    const r = (lat * Math.PI) / 180
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
  }
  return { x0: x(west), x1: Math.min(n - 1, x(east)), y0: y(north), y1: Math.min(n - 1, y(south)) }
}

/** Every tile of a layer: the wide area to zoom 10, the route area to the layer maximum. */
function tilesFor(maxZoom: number): [number, number, number][] {
  const seen = new Set<string>()
  const out: [number, number, number][] = []
  const add = (area: Area, zMax: number) => {
    for (let z = 0; z <= zMax; z++) {
      const { x0, x1, y0, y1 } = tileRange(area, z)
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) {
          const key = `${z}/${x}/${y}`
          if (!seen.has(key)) {
            seen.add(key)
            out.push([z, x, y])
          }
        }
    }
  }
  add(CONTEXT_AREA, Math.min(CONTEXT_MAX_ZOOM, maxZoom))
  add(ROUTE_AREA, maxZoom)
  return out
}

const exists = (url: URL) => access(url).then(() => true, () => false)

async function fetchTile(url: string): Promise<Buffer | null> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url).catch(() => null)
    if (res?.ok) return Buffer.from(await res.arrayBuffer())
    if (res?.status === 404) return null // the service has no tile here
    if (attempt >= RETRIES) throw new Error(`${url}: ${res?.status ?? 'network error'}`)
    await new Promise((r) => setTimeout(r, 1000 * attempt))
  }
}

async function downloadLayer(id: TileLayerId) {
  const layer = TILE_LAYERS[id]
  const tiles = tilesFor(layer.maxZoom)
  let done = 0, saved = 0, missing = 0, next = 0
  console.log(`${id}: ${tiles.length} tiles (zoom 0–${layer.maxZoom}) → public/tiles/${layer.dir}`)

  const worker = async () => {
    while (next < tiles.length) {
      const [z, x, y] = tiles[next++]
      const file = new URL(`${layer.dir}/${z}/${x}/${y}.${layer.ext}`, OUT)
      if (!(await exists(file))) {
        const data = await fetchTile(SOURCES[id].replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)))
        if (data) {
          await mkdir(new URL('.', file), { recursive: true })
          await writeFile(file, data)
          saved++
        } else missing++
      }
      if (++done % 500 === 0) console.log(`  ${id}: ${done}/${tiles.length}`)
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  console.log(`${id}: done (${saved} new, ${missing} not on the server)`)
}

const requested = process.argv.slice(2) as TileLayerId[]
const ids = requested.length ? requested : (Object.keys(TILE_LAYERS) as TileLayerId[])
for (const id of ids) {
  if (!(id in TILE_LAYERS)) throw new Error(`Unknown layer "${id}". Use: ${Object.keys(TILE_LAYERS).join(', ')}`)
  await downloadLayer(id)
}
