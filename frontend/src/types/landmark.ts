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

export type KnowledgeKind = 'food' | 'events' | 'nature' | 'history' | 'arts'

/** What an island or peak is known for, one card-sized line each (a draft until the team checks it). */
export interface PlaceKnowledge {
  tagline?: string
  /** Left empty for the team to fill from verified sources */
  indigenousName?: string
  /** `months` (1–12): an event that happens then; it comes first, with a "This month" badge, in those months */
  specialties?: { kind: KnowledgeKind; text: string; months?: number[] }[]
  /** False until a team member has fact-checked the entry */
  checked: boolean
}

/** Landmark texts by id (src/mocks/{lang}/landmarks.json). */
export type LandmarksContent = Record<string, { name: string; fact: string; knowledge?: PlaceKnowledge }>
