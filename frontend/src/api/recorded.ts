import { decodeTides, decodeWeather } from '../bridge/decode'
import type { Tides, Weather } from '../bridge/model'
import type { TidesWire, WeatherWire } from '../types/bridge'
import { loadSnapshot } from './bridge'
import { RECORDED_DAY } from './shipFeed'

/*
 * The recorded day's tides (DFO predictions) and weather (Open-Meteo), from the bridge's offline copy of it in
 * public/data/{RECORDED_DAY}. The kiosk shows them with the sample ship feed, so every number on screen is from
 * the same day. Each file is fetched once; null when it is missing.
 */

let tides: Promise<Tides | null> | undefined
let weather: Promise<Weather | null> | undefined

export function loadRecordedTides(): Promise<Tides | null> {
  tides ??= loadSnapshot<TidesWire>(RECORDED_DAY, 'tides')
    .then(decodeTides)
    .catch((err) => {
      console.warn('Recorded tides unavailable.', err)
      return null
    })
  return tides
}

export function loadRecordedWeather(): Promise<Weather | null> {
  weather ??= loadSnapshot<WeatherWire>(RECORDED_DAY, 'weather')
    .then(decodeWeather)
    .catch((err) => {
      console.warn('Recorded weather unavailable.', err)
      return null
    })
  return weather
}
