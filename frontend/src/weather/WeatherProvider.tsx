import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { loadRecordedWeather } from '../api/recorded'
import { getLiveWeather, type LiveWeather } from '../api/weather'
import type { Weather as RecordedDay } from '../bridge/model'
import { LIVE_DATA } from '../config/env'
import { useSession } from '../context/SessionContext'
import { useDataTime } from '../hooks/useDataTime'
import { distanceM } from '../ship/geo'
import { useShip } from '../ship/ShipProvider'
import type { LatLon } from '../types/route'
import type { Weather } from '../types/weather'
import { recordedWeather } from './recorded'

/** Fetch again after this time (ms)… */
const REFRESH_MS = 10 * 60_000
/** …or once the ship has moved this far (m). */
const MOVE_M = 2000
const CHECK_MS = 5000

interface WeatherData {
  /** The backend's answer (with VITE_LIVE_DATA), or null */
  live: LiveWeather | null
  /** The recorded day's Open-Meteo weather, for the parts with no live answer; null until loaded */
  recorded: RecordedDay | null
}

const WeatherContext = createContext<WeatherData>({ live: null, recorded: null })

/**
 * Weather at the ship's position: live with VITE_LIVE_DATA, and the recorded day for every part without a live
 * answer. Fetched only during a visitor session. Needs a ShipProvider above.
 */
export function WeatherProvider({ children }: { children: ReactNode }) {
  const { active } = useSession()
  const ship = useShip()
  const position = useRef<LatLon | null>(null)
  const [live, setLive] = useState<LiveWeather | null>(null)
  const [recorded, setRecorded] = useState<RecordedDay | null>(null)

  useEffect(() => {
    position.current = ship ? [ship.row.latitude, ship.row.longitude] : null
  }, [ship])

  useEffect(() => {
    if (!active) return
    let alive = true
    loadRecordedWeather().then((day) => alive && setRecorded(day))
    return () => {
      alive = false
    }
  }, [active])

  useEffect(() => {
    if (!LIVE_DATA || !active) return
    let alive = true
    let last: { at: LatLon; time: number } | undefined
    const check = async () => {
      const at = position.current
      if (!at || (last && Date.now() - last.time < REFRESH_MS && distanceM(at, last.at) < MOVE_M)) return
      last = { at, time: Date.now() }
      const next = await getLiveWeather(at[0], at[1])
      if (alive) setLive(next)
    }
    const id = setInterval(check, CHECK_MS)
    check()
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [active])

  return <WeatherContext value={{ live, recorded }}>{children}</WeatherContext>
}

/**
 * The weather the screens show: each live part, and the recorded day's (at the ship's recorded moment) for the rest.
 * Null until there is something to show.
 */
// eslint-disable-next-line react/only-export-components
export function useWeather(): Weather | null {
  const { live, recorded } = useContext(WeatherContext)
  const ship = useShip()
  const at = useDataTime(live?.weather ? 'live' : 'sample')
  const past = recorded && ship ? recordedWeather(recorded, [ship.row.latitude, ship.row.longitude], at.getTime()) : null
  const weather = live?.weather ?? past
  if (!weather) return null
  return {
    ...weather,
    visibilityKm: weather.visibilityKm ?? past?.visibilityKm ?? null,
    waves: live?.waves ?? past?.waves ?? null,
    sources: { weather: live?.weather ? 'live' : 'sample', waves: live?.waves ? 'live' : 'sample' },
  }
}
