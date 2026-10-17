import type { ReadingKey, TrackKey } from './feed'

/* Static content. Each type is the response of GET /api/{name}?lang=en|fr. */

/** Text for one route zone (key = zone id in src/config/route.json). */
export interface ZoneText {
  /** Short place name for the "You are here" pill */
  here: string
  blurb: string
  /** Grown-ups pill title */
  adultTitle: string
  lookout: { title: string; text: string; photo: string }
  happening: { title: string; text: string }
}

export type ZonesContent = Record<string, ZoneText>

export interface ReadingMeta {
  key: ReadingKey
  name: string
  unit: string
  digits: number
  /** Quality-check pass rate in percent (static until the API sends QC data) */
  qc: number
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
}

export interface SpeciesContent {
  featured: {
    name: string
    latin: string
    text: string
    photo: string
    sizes: { role: 'you' | 'featured' | 'reference'; label: string; m: number }[]
    footnote: string
  }
  items: Species[]
}

/** Coordinates are in the 1848 × 600 slice drawing. */
export interface SeafloorContent {
  markers: { label: string; cx: number; cy: number; tx: number; ty: number }[]
  places: { label: string; x: number }[]
  facts: { eyebrow: string; title: string; text: string }[]
}

export interface TidesContent {
  place: string
  headline: string
  sub: string
  /** Local time of the tide reading, "HH:MM" */
  observedAt: string
  /** Tide height in metres, one value every 24 minutes from 00:00 (61 values) */
  heights: number[]
  extremes: { type: 'high' | 'low'; h: number; at: string }[]
  current: { title: string; text: string; topSpeedKn: number; bearingDeg: number }
  explainer: { title: string; text: string }
}

export interface WeatherContent {
  tempC: number
  feelsLikeC: number
  sky: string
  wind: { kn: number; fromDeg: number }
  waves: { m: number; text: string }
  visibilityKm: number
  visibilityText: string
  /** Local time, "HH:MM" */
  sunset: string
  moonPhase: string
}

export interface QuizQuestion {
  text: string
  answer: string
  pic: string
  options: [string, string][]
  hint: string
  why: string
}

export interface QuizContent {
  questions: QuizQuestion[]
}

/** Map of content name → response type. */
export interface ContentMap {
  zones: ZonesContent
  readings: ReadingsContent
  species: SpeciesContent
  seafloor: SeafloorContent
  tides: TidesContent
  weather: WeatherContent
  quiz: QuizContent
}

export type ContentName = keyof ContentMap
