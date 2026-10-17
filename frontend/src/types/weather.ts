import type { DataSource } from './source'

/** Weather at the ship, every value filled in: from the backend, or from the sample where a source is down. */
export interface Weather {
  tempC: number
  feelsLikeC: number
  /** OpenWeatherMap condition id (e.g. 802) and icon code (e.g. "03d"; "n" at night) */
  condition: { id: number; icon: string }
  /** Wind speed and the direction it comes from */
  wind: { kn: number; fromDeg: number }
  /** Wave height (m) */
  waves: { m: number }
  visibilityKm: number
  /** Local time, "HH:MM" */
  sunset: string
  sources: { weather: DataSource; waves: DataSource }
}

/** GET /api/weather?lat&lon (backend). A part is "unavailable" and its values null when its source is down. */
export interface WeatherResponse {
  parts: { weather: 'live' | 'unavailable'; waves: 'live' | 'unavailable' }
  tempC: number | null
  feelsLikeC: number | null
  condition: { id: number; icon: string } | null
  wind: { kn: number; fromDeg: number; gustKn: number | null } | null
  waves: { m: number; swellM: number | null; periodS: number | null } | null
  seaTempC: number | null
  visibilityKm: number | null
  sunset: string | null
}
