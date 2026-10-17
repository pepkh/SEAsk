import { TILES_URL } from '../config/env'
import { TERRAIN_DIR } from '../config/tiles'

let probe: Promise<boolean> | undefined

/**
 * True when the offline terrain is on the server. public/tiles is not in git (scripts/build-terrain.sh
 * and scripts/download-tiles.ts make it), so without it the Journey screens use the 3D sea.
 */
export function tilesAvailable(): Promise<boolean> {
  probe ??= fetch(`${TILES_URL}/${TERRAIN_DIR}/layer.json`)
    // The dev server answers a missing file with index.html, so the body must parse as the terrain layer.
    .then((res) => (res.ok ? res.json() : null))
    .then((layer: { tiles?: unknown } | null) => Boolean(layer?.tiles))
    .catch(() => false)
  return probe
}
