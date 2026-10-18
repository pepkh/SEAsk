import { sunTimes } from '../bridge/derive/sun'
import { marineAt, weatherAt, windSampler } from '../bridge/field'
import type { Weather as RecordedDay } from '../bridge/model'
import { hhmmOf } from '../i18n/format'
import type { LatLon } from '../types/route'
import type { Weather } from '../types/weather'
import { conditionOf } from './describe'

/** OpenWeatherMap icon number for a condition id (the kiosk only reads the day / night letter after it). */
const iconOf = (id: number) => (id === 741 ? '50' : id >= 500 ? '10' : id >= 300 && id < 400 ? '09' : id === 800 ? '01' : id === 801 ? '02' : id === 802 ? '03' : '04')

/**
 * The recorded day's Open-Meteo weather (the bridge's weather file) at a place and moment (epoch ms), the way the
 * kiosk shows a live answer. Null outside the file's day or area.
 */
export function recordedWeather(w: RecordedDay, [lat, lon]: LatLon, time: number): Omit<Weather, 'sources'> | null {
  const tempC = weatherAt(w, 'tempC', time, lat, lon)
  const uv = windSampler(w, time)?.(lat, lon)
  if (!Number.isFinite(tempC) || !uv) return null
  const vis = weatherAt(w, 'visKm', time, lat, lon)
  const waveM = marineAt(w, 'waveM', time, lat, lon)
  const sun = sunTimes(w.axis.t0, lat, lon)
  const night = sun.sunrise !== null && sun.sunset !== null && (time < sun.sunrise || time > sun.sunset)
  const id = conditionOf(weatherAt(w, 'cloudPct', time, lat, lon), weatherAt(w, 'precipMm', time, lat, lon), vis)
  return {
    tempC,
    // The model file has no feels-like temperature: the air temperature stands in.
    feelsLikeC: tempC,
    condition: { id, icon: iconOf(id) + (night ? 'n' : 'd') },
    wind: { kn: Math.hypot(uv[0], uv[1]), fromDeg: ((Math.atan2(-uv[0], -uv[1]) * 180) / Math.PI + 360) % 360 },
    waves: Number.isFinite(waveM) ? { m: waveM } : null,
    visibilityKm: Number.isFinite(vis) ? vis : null,
    sunset: sun.sunset === null ? '' : hhmmOf(sun.sunset),
  }
}
