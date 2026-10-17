import { useEffect, useRef, useState } from 'react'
import { getTides } from '../api/tides'
import { LIVE_DATA } from '../config/env'
import { useContent } from '../hooks/useContent'
import { compassPoint, formatNumber, formatTime, todayAt } from '../i18n/format'
import { useLanguage } from '../i18n/LanguageContext'
import { distanceM } from '../ship/geo'
import { useShip } from '../ship/ShipProvider'
import type { TidesContent } from '../types/content'
import type { LatLon } from '../types/route'
import type { DataSource } from '../types/source'
import type { TidesResponse } from '../types/tides'

/** Fetch again after this time (ms)… */
const REFRESH_MS = 30 * 60_000
/** …or once the ship has moved this far (m), as the nearest tide station may change. */
const MOVE_M = 5000
const CHECK_MS = 5000
/** Below this speed (kn) the current card says "slack water". */
const SLACK_KN = 0.5

export interface Tides {
  tides: TidesContent
  /** Place of the current card (the current station can differ from the tide station) */
  currentPlace: string
  source: DataSource
}

/**
 * Tides for the Tides screen: DFO predictions near the ship (with VITE_LIVE_DATA) on top of the bundled
 * sample, whose texts (explainer) are kept. Null until the sample content has loaded.
 */
export function useTides(): Tides | null {
  const sample = useContent('tides')
  const ship = useShip()
  const { t, lang } = useLanguage()
  const [live, setLive] = useState<TidesResponse | null>(null)
  const position = useRef<LatLon | null>(null)

  useEffect(() => {
    position.current = ship ? [ship.row.latitude, ship.row.longitude] : null
  }, [ship])

  useEffect(() => {
    if (!LIVE_DATA) return
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
  }, [])

  if (!sample) return null
  if (!live) return { tides: sample, currentPlace: sample.place, source: 'sample' }

  const c = live.current
  let current = sample.current
  if (c) {
    const dir = compassPoint(c.towardDeg, t('tides.compassWords'))
    const slack = c.speedKn < SLACK_KN
    const next = c.nextSlack ? ` ${t('tides.nextSlack', { time: formatTime(todayAt(c.nextSlack), lang) })}` : ''
    const top = Math.max(c.maxFloodKn ?? 0, c.maxEbbKn ?? 0)
    current = {
      title: slack ? t('tides.slackTitle') : t('tides.flowing', { dir }),
      text: (slack ? t('tides.slackText') : t('tides.liveCurrent', { kn: formatNumber(c.speedKn, 1, lang) })) + next,
      topSpeedKn: top > 0 ? Math.round(top) : sample.current.topSpeedKn,
      bearingDeg: c.towardDeg,
    }
  }
  return {
    tides: { ...sample, place: live.station.name, heights: live.heights, extremes: live.extremes, current },
    currentPlace: c?.station ?? sample.place,
    source: 'live',
  }
}
