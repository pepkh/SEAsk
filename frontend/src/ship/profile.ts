import profileJson from '../mocks/common/route-profile.json'
import type { TrackKey } from '../types/feed'
import type { ProfileBin, ProfileValue, RouteProfile } from '../types/profile'

/**
 * Bundled copy of GET /route/profile, written by backend/scripts/build_derived.py. It is used until
 * the API answers (and offline). The depth under the route never changes, so slice.ts reads it here.
 */
export const BUNDLED_PROFILE = profileJson as RouteProfile

/** The profile value that matches a track reading. */
export const PROFILE_VALUE: Record<TrackKey, ProfileValue> = {
  tsg_temperature: 'sst',
  salinity: 'salinity',
  oxygen_saturation: 'o2_sat',
  chlorophyll: 'chl',
  turbidity: 'turbidity',
}

/** The bin that holds a route fraction (0 at Swartz Bay, 1 at Tsawwassen). */
export function binAt(profile: RouteProfile, fraction: number): ProfileBin {
  const { bins } = profile
  return bins[Math.min(bins.length - 1, Math.max(0, Math.floor(fraction * bins.length)))]
}

/** Mean over the whole route, weighted by the underway seconds in each bin. Null without data. */
export function routeMean(profile: RouteProfile, value: ProfileValue): number | null {
  let sum = 0
  let n = 0
  for (const b of profile.bins) {
    const v = b[value]
    if (v === null || b.n === 0) continue
    sum += v * b.n
    n += b.n
  }
  return n ? sum / n : null
}
