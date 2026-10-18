import { BRIDGE_SOURCES, short, type SourceId } from '../config/sources'
import type { DayData, PartName, PartStatus } from './model'

/** The providers behind each bridge dataset (src/config/sources.ts; SOURCES.md has the details per value). */
export const PART_SOURCES: Record<PartName, SourceId[]> = {
  ship: ['onc'],
  stats: ['onc'],
  profile: ['onc'],
  climatology: ['onc'],
  tides: ['dfo'],
  // Waves from Open-Meteo Marine: Copernicus Marine models
  weather: ['openMeteo', 'copernicusMarine'],
  windobs: ['eccc'],
  stations: ['onc'],
  currents: ['onc'],
  // SalishSeaCast near the route, the Mercator global model (Copernicus Marine, via Open-Meteo) beyond it
  ocean: ['salishSeaCast', 'copernicusMarine', 'openMeteo'],
  profiles: ['onc'],
  traffic: ['onc'],
  sources: ['onc'],
  fouling: ['seaskFouling'],
}

/** "ONC", "DFO", …: the short names of a dataset's providers, for a label. */
export const partShort = (part: PartName) => PART_SOURCES[part].map((id) => short(id)).join(', ')

/** Providers of the loaded datasets (and of OpenWeatherMap's live fallback when it is in use), in BRIDGE_SOURCES order. */
export function sourcesInUse(status: Record<PartName, PartStatus>, day: DayData): SourceId[] {
  const used = new Set<SourceId>()
  for (const [part, s] of Object.entries(status) as [PartName, PartStatus][]) if (s.state === 'ready') PART_SOURCES[part].forEach((id) => used.add(id))
  if (day.pointWeather) used.add('owm')
  return BRIDGE_SOURCES.filter((id) => used.has(id))
}
