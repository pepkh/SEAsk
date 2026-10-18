import { LIVE_DATA } from '../config/env'
import type { Weather, WeatherResponse } from '../types/weather'
import { getJson } from './http'

/** The live parts of a backend answer: OpenWeatherMap (weather) and Open-Meteo Marine (waves), null when down. */
export interface LiveWeather {
  weather: Omit<Weather, 'waves' | 'sources'> | null
  waves: Weather['waves']
}

/** The OpenWeatherMap part of a backend answer, or null when it is down or incomplete. */
function liveWeather(r: WeatherResponse): LiveWeather['weather'] {
  const { tempC, feelsLikeC, condition, wind, visibilityKm, sunset } = r
  if (r.parts.weather !== 'live' || tempC === null || feelsLikeC === null || !condition || !wind || !sunset) return null
  return { tempC, feelsLikeC, condition, wind: { kn: wind.kn, fromDeg: wind.fromDeg }, visibilityKm, sunset }
}

/** GET /api/weather at a point, or null without live data or when the backend cannot be reached. */
export async function getLiveWeather(lat: number, lon: number): Promise<LiveWeather | null> {
  if (!LIVE_DATA) return null
  try {
    const r = await getJson<WeatherResponse>(`/api/weather?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`, 10_000)
    return { weather: liveWeather(r), waves: r.parts.waves === 'live' && r.waves ? { m: r.waves.m } : null }
  } catch (err) {
    console.warn('Live weather unavailable, showing the recorded day.', err)
    return null
  }
}
