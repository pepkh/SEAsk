import { LIVE_DATA } from '../config/env'
import type { RouteProfile } from '../types/profile'
import { getJson } from './http'

/** Water values along the route on the recorded day (GET /route/profile), or null without live data or when the backend is down. */
export async function getRouteProfile(): Promise<RouteProfile | null> {
  if (!LIVE_DATA) return null
  try {
    return await getJson<RouteProfile>('/route/profile', 10_000)
  } catch (err) {
    console.warn('Route profile unavailable, showing the bundled copy.', err)
    return null
  }
}
