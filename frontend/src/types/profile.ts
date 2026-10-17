/** One equal part of the route line (GET /route/profile). Water values are means of the underway seconds in the bin. */
export interface ProfileBin {
  bin: number
  /** Middle of the bin: 0 at Swartz Bay, 1 at Tsawwassen */
  fraction: number
  km: number
  /** Zone id from src/config/route.json */
  zone: string
  lat: number
  lon: number
  /** Water depth under the route line (GEBCO 2026), m. 0 on land cells near the berths. */
  depth_m: number | null
  /** Underway seconds in the bin; the values are null when 0 */
  n: number
  /** °C */
  sst: number | null
  /** PSU */
  salinity: number | null
  /** % */
  o2_sat: number | null
  /** µg/L */
  chl: number | null
  /** NTU */
  turbidity: number | null
  /** Surface density minus 1000, kg/m³ */
  sigma_t: number | null
  /** Bin value minus the mean over the whole route */
  sst_anom: number | null
  salinity_anom: number | null
  o2_sat_anom: number | null
}

/** Water values along the route on the recorded day (2026-08-17). crossing_id 0 = all eight crossings. */
export interface RouteProfile {
  crossing_id: number
  direction: 'swb_to_tsa' | 'tsa_to_swb' | null
  length_km: number
  /** Swartz Bay first */
  bins: ProfileBin[]
}

/** Profile values that can be charted along the route. */
export type ProfileValue = 'sst' | 'salinity' | 'o2_sat' | 'chl' | 'turbidity'
