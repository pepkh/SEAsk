import type { Habitat } from '../../types/content'

/** The Dive screen's three depth bands, top to bottom. */
export type Band = 'surface' | 'open' | 'floor'
export const BANDS: Band[] = ['surface', 'open', 'floor']

/** Which depth band each habitat belongs to. */
export const BAND_OF: Record<Habitat, Band> = { surface: 'surface', shore: 'surface', openWater: 'open', seafloor: 'floor', deep: 'floor' }
