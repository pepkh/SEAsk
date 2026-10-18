import data from '../mocks/common/content-sources.json'

export interface ContentSource {
  /** Publisher, as shown on screen ("Fisheries and Oceans Canada") */
  name: string
  url: string
  /** Day the page was read, "YYYY-MM-DD" */
  accessed: string
}

export interface ContentSourceEntry {
  sources: ContentSource[]
  /** Set by a person on the team once they have checked the fact against its sources */
  checked: boolean
  note?: string
}

const SOURCES: Record<string, ContentSourceEntry> = data

/**
 * Where a written fact comes from. One file for both languages (src/mocks/common/content-sources.json), keyed by
 * the fact's place in the content: "species.orca", "quiz.0", "seafloor.facts.1", "zones.active-pass.happening",
 * "landmarks.mayne.fact", "guide.depth", "tides.explainer". SOURCES.md at the repo root explains the keys.
 */
export const contentSources = (key: string): ContentSourceEntry | undefined => SOURCES[key]
