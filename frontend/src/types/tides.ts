/** GET /api/tides?lat&lon (backend, DFO predictions for the station nearest the ship). Times are local "HH:MM". */
export interface TidesResponse {
  station: { code: string; name: string }
  /** Local date, "YYYY-MM-DD" */
  date: string
  stepMin: number
  /** Water height (m) from local 00:00, every stepMin minutes */
  heights: number[]
  extremes: { type: 'high' | 'low'; h: number; at: string }[]
  /** Tidal current in Active Pass, or null when that station is down */
  current: {
    station: string
    speedKn: number
    /** Direction the water flows toward, degrees true */
    towardDeg: number
    flooding: boolean
    maxFloodKn: number | null
    maxEbbKn: number | null
    nextSlack: string | null
    events: { type: 'slack' | 'flood' | 'ebb'; at: string; kn: number }[]
  } | null
}
