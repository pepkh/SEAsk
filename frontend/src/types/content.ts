import type { LandmarksContent } from './landmark'
import type { QaItem } from '../qa/types'
import type { ReadingKey, TrackKey } from './feed'

/* Static content. Each type is the response of GET /api/{name}?lang=en|fr. */

/** Text for one route zone (key = zone id in src/config/route.json). */
export interface ZoneText {
  /** Short place name for the "You are here" pill */
  here: string
  blurb: string
  /** Grown-ups pill title */
  adultTitle: string
  /** `photo` is the translated subject; `photoId` keys src/config/photos.json. */
  lookout: { title: string; text: string; photo: string; photoId?: string }
  happening: { title: string; text: string }
}

export type ZonesContent = Record<string, ZoneText>

export interface ReadingMeta {
  key: ReadingKey
  name: string
  unit: string
  digits: number
  /** Present for the four readings on the Kids Journey tiles */
  kids?: { name: string; hint: string; digits: number }
}

export interface TrackMeta {
  key: TrackKey
  label: string
  unit: string
  min: number
  max: number
}

export interface ReadingsContent {
  items: ReadingMeta[]
  tracks: TrackMeta[]
}

export type Habitat = 'surface' | 'shore' | 'openWater' | 'seafloor' | 'deep'
export type SpeciesGroup = 'mammals' | 'fish' | 'invertebrates' | 'seaweed'

export interface Species {
  id: string
  name: string
  habitat: Habitat
  group: SpeciesGroup
  text: string
  photo: string
  photoId?: string
  latin?: string
  /** Typical adult length (m), for the size check next to you; left out where a size makes no sense (a reef) */
  sizeM?: number
}

export interface SpeciesContent {
  /** The "Animal of the crossing" (it gets a badge on the Dive screen) */
  featuredId: string
  items: Species[]
}

/** Coordinates are in the 1848 × 600 slice drawing. */
export interface SeafloorContent {
  markers: { label: string; cx: number; cy: number; tx: number; ty: number }[]
  places: { label: string; x: number }[]
  facts: { eyebrow: string; title: string; text: string }[]
}

/** The tide numbers come from DFO (live, or the recorded day): see src/tides/useTides.ts. */
export interface TidesContent {
  explainer: { title: string; text: string }
}

export interface QuizQuestion {
  text: string
  answer: string
  pic: string
  picId?: string
  options: [string, string][]
  hint: string
  why: string
}

export interface QuizContent {
  questions: QuizQuestion[]
}

/** Map of content name → response type. */
/** Questions the diver mascot answers (mocks/{lang}/guide-qa.json). A preview: canned answers. */
export interface GuideQaContent {
  button: string
  title: string
  /** Chip that starts the guided tour (ferry screen) */
  tour: string
  preview: string
  close: string
  noMatch: string
  items: QaItem[]
}

export interface ContentMap {
  landmarks: LandmarksContent
  zones: ZonesContent
  readings: ReadingsContent
  species: SpeciesContent
  seafloor: SeafloorContent
  tides: TidesContent
  quiz: QuizContent
  'guide-qa': GuideQaContent
}

export type ContentName = keyof ContentMap
