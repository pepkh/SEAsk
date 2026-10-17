import landmarksJson from '../config/landmarks.json'
import { distanceM } from '../ship/geo'
import type { Landmark, LandmarkKind } from '../types/landmark'

const LANDMARKS = landmarksJson.landmarks as Landmark[]

/** When several are in range, a summit beats the island it stands on. */
const RANK: Record<LandmarkKind, number> = { peak: 0, place: 1, island: 2, water: 2 }

/**
 * The landmark at a point on the map. Mountains and islands only match on land and channels only on water;
 * places (terminals, towns) match both, because they sit at the shore.
 */
export function findLandmark(lat: number, lon: number, onLand: boolean): Landmark | undefined {
  let best: { mark: Landmark; rank: number; score: number } | undefined
  for (const mark of LANDMARKS) {
    if (mark.kind === 'water' ? onLand : mark.kind !== 'place' && !onLand) continue
    const score = Math.min(...mark.points.map((p) => distanceM([lat, lon], p))) / mark.radiusM
    if (score > 1) continue
    const rank = RANK[mark.kind]
    if (!best || rank < best.rank || (rank === best.rank && score < best.score)) best = { mark, rank, score }
  }
  return best?.mark
}

export const findLandmarkById = (id: string) => LANDMARKS.find((mark) => mark.id === id)

/**
 * The island whose shore is nearest to a point (the ship), within `withinM` of it, or undefined.
 * Island points sit inside the island, `radiusM` from its shore.
 */
export function nearestIsland(lat: number, lon: number, withinM: number): Landmark | undefined {
  let best: { mark: Landmark; gap: number } | undefined
  for (const mark of LANDMARKS) {
    if (mark.kind !== 'island') continue
    const gap = Math.min(...mark.points.map((p) => distanceM([lat, lon], p))) - mark.radiusM
    if (gap <= withinM && (!best || gap < best.gap)) best = { mark, gap }
  }
  return best?.mark
}
