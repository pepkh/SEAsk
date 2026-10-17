import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { getTides } from '../api/tides'
import { LIVE_DATA } from '../config/env'
import { useSession } from '../context/SessionContext'
import { distanceM } from '../ship/geo'
import { useShip } from '../ship/ShipProvider'
import type { LatLon } from '../types/route'
import type { TidesResponse } from '../types/tides'

/** Fetch again after this time (ms)… */
const REFRESH_MS = 30 * 60_000
/** …or once the ship has moved this far (m), as the nearest tide station may change. */
const MOVE_M = 5000
const CHECK_MS = 5000

const TidesContext = createContext<TidesResponse | null>(null)

/**
 * DFO tide predictions near the ship (with VITE_LIVE_DATA), fetched once for the whole kiosk and only during a
 * visitor session. null until the first answer (or without live data). Needs a ShipProvider above.
 */
export function TidesProvider({ children }: { children: ReactNode }) {
  const { active } = useSession()
  const ship = useShip()
  const [live, setLive] = useState<TidesResponse | null>(null)
  const position = useRef<LatLon | null>(null)

  useEffect(() => {
    position.current = ship ? [ship.row.latitude, ship.row.longitude] : null
  }, [ship])

  useEffect(() => {
    if (!LIVE_DATA || !active) return
    let alive = true
    let last: { at: LatLon; time: number } | undefined
    const check = async () => {
      const at = position.current
      if (!at || (last && Date.now() - last.time < REFRESH_MS && distanceM(at, last.at) < MOVE_M)) return
      last = { at, time: Date.now() }
      const next = await getTides(at[0], at[1])
      if (alive && next) setLive(next)
    }
    const id = setInterval(check, CHECK_MS)
    check()
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [active])

  return <TidesContext value={live}>{children}</TidesContext>
}

/** The live tide answer, or null (useTides merges it onto the bundled sample). */
// eslint-disable-next-line react/only-export-components
export const useLiveTides = () => useContext(TidesContext)
