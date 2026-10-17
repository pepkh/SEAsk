import type { LatLon } from './route'

export type LandmarkKind = 'peak' | 'island' | 'place' | 'water'

/** A named mountain, island, place or channel on the map (src/config/landmarks.json). */
export interface Landmark {
  id: string
  kind: LandmarkKind
  /** One or more points; long islands and channels have several. Peaks: the summit. */
  points: LatLon[]
  /** The pointer must be this close to one of the points (m). */
  radiusM: number
  /** Peaks only (m above sea level) */
  elevationM?: number
}

/** Landmark texts by id (src/mocks/{lang}/landmarks.json). */
export type LandmarksContent = Record<string, { name: string; fact: string }>
