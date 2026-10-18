/* Weather numbers → the words the panel shows (keys under "weather" in src/i18n). */

export type Sky = 'clear' | 'fewClouds' | 'partlyCloudy' | 'cloudy' | 'overcast' | 'drizzle' | 'rain' | 'thunder' | 'snow' | 'fog'

/** OpenWeatherMap condition id → sky (https://openweathermap.org/weather-conditions) */
export function skyOf(id: number): Sky {
  if (id >= 200 && id < 300) return 'thunder'
  if (id >= 300 && id < 400) return 'drizzle'
  if (id >= 500 && id < 600) return 'rain'
  if (id >= 600 && id < 700) return 'snow'
  if (id >= 700 && id < 800) return 'fog'
  return id === 800 ? 'clear' : id === 801 ? 'fewClouds' : id === 802 ? 'partlyCloudy' : id === 803 ? 'cloudy' : 'overcast'
}

/**
 * The recorded day's Open-Meteo hour → the nearest OpenWeatherMap condition id, so it shows like a live answer:
 * fog under 1 km visibility, then rain (mm in the hour), then cloud cover in OpenWeatherMap's bands.
 */
export function conditionOf(cloudPct: number, rainMm: number, visKm: number): number {
  if (visKm < 1) return 741
  if (rainMm >= 2.5) return 501
  if (rainMm >= 0.2) return 500
  if (rainMm > 0) return 300
  return cloudPct < 11 ? 800 : cloudPct < 25 ? 801 : cloudPct < 51 ? 802 : cloudPct < 85 ? 803 : 804
}

export type WaveSize = 'calm' | 'ripples' | 'small' | 'choppy' | 'rough'

export function waveSizeOf(m: number): WaveSize {
  return m < 0.1 ? 'calm' : m < 0.6 ? 'ripples' : m < 1.2 ? 'small' : m < 2 ? 'choppy' : 'rough'
}

export type Visibility = 'far' | 'islands' | 'hazy' | 'fog'

/** OpenWeatherMap reports 10 km at most. */
export function visibilityOf(km: number): Visibility {
  return km >= 10 ? 'far' : km >= 4 ? 'islands' : km >= 1 ? 'hazy' : 'fog'
}
