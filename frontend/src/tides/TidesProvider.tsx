import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { loadRecordedTides } from '../api/recorded'
import { getTides } from '../api/tides'
import type { Tides } from '../bridge/model'
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

interface TideData {
  /** Today's DFO predictions near the ship (with VITE_LIVE_DATA), or null */
  live: TidesResponse | null
  /** The recorded day's DFO predictions, shown when there is no live answer; null until loaded */
  recorded: Tides | null
}

const TidesContext = createContext<TideData>({ live: null, recorded: null })

/**
 * DFO tide predictions near the ship (with VITE_LIVE_DATA), fetched once for the whole kiosk and only during a
 * visitor session, and the recorded day's predictions for when there is no live answer. Needs a ShipProvider above.
 */
export function TidesProvider({ children }: { children: ReactNode }) {
  const { active } = useSession()
  const ship = useShip()
  const [live, setLive] = useState<TidesResponse | null>(null)
  const [recorded, setRecorded] = useState<Tides | null>(null)
  const position = useRef<LatLon | null>(null)

  useEffect(() => {
    if (!active) return
    let alive = true
    loadRecordedTides().then((tides) => alive && setRecorded(tides))
    return () => {
      alive = false
    }
  }, [active])

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

  return <TidesContext value={{ live, recorded }}>{children}</TidesContext>
}

/** The live tide answer and the recorded day (useTides picks one and adds the texts). */
// eslint-disable-next-line react/only-export-components
export const useTideData = () => useContext(TidesContext)
