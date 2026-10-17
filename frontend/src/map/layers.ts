import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  Rectangle,
  UrlTemplateImageryProvider,
  type TerrainProvider,
} from 'cesium'
import { MAP_IMAGERY, TILES_URL } from '../config/env'
import {
  CONTEXT_AREA,
  CONTEXT_MAX_ZOOM,
  ROUTE_AREA,
  TERRAIN_CREDIT,
  TERRAIN_DIR,
  TILE_LAYERS,
  type Area,
  type TileLayer,
} from '../config/tiles'
import type { Lang } from '../i18n/LanguageContext'

export const toRectangle = (a: Area) => Rectangle.fromDegrees(a.west, a.south, a.east, a.north)

/** One provider per layer and area, so a language change only swaps the label layer. */
const providers = new Map<string, UrlTemplateImageryProvider>()

function provider(key: string, layer: TileLayer, area: Area, maxZoom: number) {
  let p = providers.get(key)
  if (!p) {
    p = new UrlTemplateImageryProvider({
      url: `${TILES_URL}/${layer.dir}/{z}/{x}/{y}.${layer.ext}`,
      maximumLevel: maxZoom,
      rectangle: toRectangle(area),
      credit: layer.credit || undefined,
    })
    providers.set(key, p)
  }
  return p
}

/**
 * Imagery providers, bottom first. Each layer has a wide area (zoom 0–10)
 * and the route area (full zoom), so the kiosk never asks for a tile that is not on disk.
 */
export function imageryProviders(lang: Lang): { key: string; provider: UrlTemplateImageryProvider }[] {
  const layers =
    MAP_IMAGERY === 'sentinel'
      ? [TILE_LAYERS.sentinel]
      : [TILE_LAYERS.nrcanMap, lang === 'fr' ? TILE_LAYERS.nrcanLabelsFr : TILE_LAYERS.nrcanLabelsEn]
  return layers.flatMap((layer) =>
    (
      [
        ['context', CONTEXT_AREA, Math.min(CONTEXT_MAX_ZOOM, layer.maxZoom)],
        ['route', ROUTE_AREA, layer.maxZoom],
      ] as const
    ).map(([part, area, maxZoom]) => {
      const key = `${layer.dir}-${part}`
      return { key, provider: provider(key, layer, area, maxZoom) }
    }),
  )
}

/** Licence attribution for the selected imagery (shown by MapScene). */
export const imageryCredit = () => (MAP_IMAGERY === 'sentinel' ? TILE_LAYERS.sentinel.credit : TILE_LAYERS.nrcanMap.credit)

let terrain: Promise<TerrainProvider> | undefined

/** Offline quantized-mesh terrain. A flat globe when the terrain tiles are not built yet. */
export function terrainProvider(): Promise<TerrainProvider> {
  terrain ??= CesiumTerrainProvider.fromUrl(`${TILES_URL}/${TERRAIN_DIR}`, {
    requestVertexNormals: true,
    credit: TERRAIN_CREDIT,
  }).catch((err: unknown) => {
    console.warn('No offline terrain, using a flat globe.', err)
    return new EllipsoidTerrainProvider()
  })
  return terrain
}
