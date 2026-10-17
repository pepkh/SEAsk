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

export type WaveSize = 'calm' | 'ripples' | 'small' | 'choppy' | 'rough'

export function waveSizeOf(m: number): WaveSize {
  return m < 0.1 ? 'calm' : m < 0.6 ? 'ripples' : m < 1.2 ? 'small' : m < 2 ? 'choppy' : 'rough'
}

export type Visibility = 'far' | 'islands' | 'hazy' | 'fog'

/** OpenWeatherMap reports 10 km at most. */
export function visibilityOf(km: number): Visibility {
  return km >= 10 ? 'far' : km >= 4 ? 'islands' : km >= 1 ? 'hazy' : 'fog'
}
