import { LIVE_DATA } from '../config/env'
import type { TidesResponse } from '../types/tides'
import { getJson } from './http'

/** DFO tide predictions near a point (GET /api/tides), or null without live data or when the backend cannot get them. */
export async function getTides(lat: number, lon: number): Promise<TidesResponse | null> {
  if (!LIVE_DATA) return null
  try {
    return await getJson<TidesResponse>(`/api/tides?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`, 10_000)
  } catch (err) {
    console.warn('Live tides unavailable, showing the sample.', err)
    return null
  }
}
