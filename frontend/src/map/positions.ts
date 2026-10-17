import { Cartesian3, Math as CesiumMath } from 'cesium'
import type { LatLon } from '../types/route'
import { WATER_HEIGHT } from './shipTrack'

/** Grid step (radians) for long lines and surfaces, so they follow the Earth's curve (about 1 km). */
export const SURFACE_GRANULARITY = CesiumMath.toRadians(0.01)

/** Lines sit 1 m above the water so they do not flicker against it. */
const LINE_HEIGHT = WATER_HEIGHT + 1

export const toPositions = (points: LatLon[], height = LINE_HEIGHT) =>
  Cartesian3.fromDegreesArrayHeights(points.flatMap(([lat, lon]) => [lon, lat, height]))
