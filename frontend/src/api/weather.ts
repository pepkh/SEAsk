import { LIVE_DATA } from '../config/env'
import sampleJson from '../mocks/common/weather.json'
import type { Weather, WeatherResponse } from '../types/weather'
import { getJson } from './http'

type WeatherValues = Omit<Weather, 'sources'>

const SAMPLE: WeatherValues = sampleJson
export const SAMPLE_WEATHER: Weather = { ...SAMPLE, sources: { weather: 'sample', waves: 'sample' } }

/** The OpenWeatherMap part of a backend answer, or null when it is down or incomplete. */
function liveWeather(r: WeatherResponse): Omit<WeatherValues, 'waves'> | null {
  const { tempC, feelsLikeC, condition, wind, visibilityKm, sunset } = r
  if (r.parts.weather !== 'live' || tempC === null || feelsLikeC === null || !condition || !wind || !sunset) return null
  return { tempC, feelsLikeC, condition, wind: { kn: wind.kn, fromDeg: wind.fromDeg }, visibilityKm: visibilityKm ?? SAMPLE.visibilityKm, sunset }
}

/** Weather at a point: GET /api/weather for the live parts, the sample for the rest. */
export async function getWeather(lat: number, lon: number): Promise<Weather> {
  if (!LIVE_DATA) return SAMPLE_WEATHER
  try {
    const r = await getJson<WeatherResponse>(`/api/weather?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`, 10_000)
    const weather = liveWeather(r)
    const waves = r.parts.waves === 'live' && r.waves ? { m: r.waves.m } : null
    return {
      ...SAMPLE,
      ...weather,
      waves: waves ?? SAMPLE.waves,
      sources: { weather: weather ? 'live' : 'sample', waves: waves ? 'live' : 'sample' },
    }
  } catch (err) {
    console.warn('Live weather unavailable, showing the sample.', err)
    return SAMPLE_WEATHER
  }
}
