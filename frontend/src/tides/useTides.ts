import { useContent } from '../hooks/useContent'
import { useDataTime } from '../hooks/useDataTime'
import { compassPoint, formatNumber, formatTime, todayAt } from '../i18n/format'
import { useLanguage } from '../i18n/LanguageContext'
import { useShip } from '../ship/ShipProvider'
import type { TidesContent } from '../types/content'
import type { DataSource } from '../types/source'
import type { TidesResponse } from '../types/tides'
import { recordedTides } from './recorded'
import { useTideData } from './TidesProvider'

/** Below this speed (kn) the current card says "slack water". */
const SLACK_KN = 0.5

/** The tide card's content: DFO numbers, and the words for the current. */
export interface TideView {
  /** DFO tide station */
  place: string
  /** Height in metres above chart datum, evenly spaced from local 00:00 to 24:00 */
  heights: number[]
  extremes: TidesResponse['extremes']
  /** null when the current station has no prediction */
  current: { title: string; text: string; topSpeedKn: number | null; bearingDeg: number } | null
  explainer: TidesContent['explainer']
}

export interface Tides {
  tides: TideView
  /** Place of the current card (the current station can differ from the tide station) */
  currentPlace: string
  /** live: today's predictions; sample: the recorded day's */
  source: DataSource
  /** The moment shown as "Now": the clock, or the recorded moment of the sample ship feed */
  at: Date
}

/**
 * Tides: today's DFO predictions near the ship (TidesProvider, with live data), else DFO's predictions for the
 * recorded day the sample ship feed is from, at the ship's recorded moment. The explainer text is bundled. Null
 * until both have loaded.
 */
export function useTides(): Tides | null {
  const text = useContent('tides')
  const { live, recorded } = useTideData()
  const ship = useShip()
  const source: DataSource = live ? 'live' : 'sample'
  const at = useDataTime(source)
  const { t, lang } = useLanguage()

  const day = live ?? (recorded && ship ? recordedTides(recorded, [ship.row.latitude, ship.row.longitude], at.getTime()) : null)
  if (!text || !day) return null

  const c = day.current
  let current: TideView['current'] = null
  if (c) {
    const dir = compassPoint(c.towardDeg, t('tides.compassWords'))
    const slack = c.speedKn < SLACK_KN
    const next = c.nextSlack ? ` ${t('tides.nextSlack', { time: formatTime(todayAt(c.nextSlack), lang) })}` : ''
    const top = Math.max(c.maxFloodKn ?? 0, c.maxEbbKn ?? 0)
    current = {
      title: slack ? t('tides.slackTitle') : t('tides.flowing', { dir }),
      text: (slack ? t('tides.slackText') : t('tides.liveCurrent', { kn: formatNumber(c.speedKn, 1, lang) })) + next,
      topSpeedKn: top > 0 ? Math.round(top) : null,
      bearingDeg: c.towardDeg,
    }
  }
  return {
    tides: { place: day.station.name, heights: day.heights, extremes: day.extremes, current, explainer: text.explainer },
    currentPlace: c?.station ?? day.station.name,
    source,
    at,
  }
}
