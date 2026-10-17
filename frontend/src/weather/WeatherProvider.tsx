import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { getWeather, SAMPLE_WEATHER } from '../api/weather'
import { LIVE_DATA } from '../config/env'
import { useSession } from '../context/SessionContext'
import { distanceM } from '../ship/geo'
import { useShip } from '../ship/ShipProvider'
import type { LatLon } from '../types/route'
import type { Weather } from '../types/weather'

/** Fetch again after this time (ms)… */
const REFRESH_MS = 10 * 60_000
/** …or once the ship has moved this far (m). */
const MOVE_M = 2000
const CHECK_MS = 5000

const WeatherContext = createContext<Weather>(SAMPLE_WEATHER)

/**
 * Weather at the ship's position (live with VITE_LIVE_DATA, else the sample), fetched only during a
 * visitor session. Needs a ShipProvider above.
 */
export function WeatherProvider({ children }: { children: ReactNode }) {
  const { active } = useSession()
  const ship = useShip()
  const position = useRef<LatLon | null>(null)
  const [weather, setWeather] = useState<Weather>(SAMPLE_WEATHER)

  useEffect(() => {
    position.current = ship ? [ship.row.latitude, ship.row.longitude] : null
  }, [ship])

  useEffect(() => {
    if (!LIVE_DATA || !active) return
    let live = true
    let last: { at: LatLon; time: number } | undefined
    const check = async () => {
      const at = position.current
      if (!at || (last && Date.now() - last.time < REFRESH_MS && distanceM(at, last.at) < MOVE_M)) return
      last = { at, time: Date.now() }
      const next = await getWeather(at[0], at[1])
      if (live) setWeather(next)
    }
    const id = setInterval(check, CHECK_MS)
    check()
    return () => {
      live = false
      clearInterval(id)
    }
  }, [active])

  return <WeatherContext value={weather}>{children}</WeatherContext>
}

// eslint-disable-next-line react/only-export-components
export const useWeather = () => useContext(WeatherContext)
