import { useContent } from '../hooks/useContent'
import { compassPoint, formatNumber, formatTime, todayAt } from '../i18n/format'
import { useLanguage } from '../i18n/LanguageContext'
import type { TidesContent } from '../types/content'
import type { DataSource } from '../types/source'
import { useLiveTides } from './TidesProvider'

/** Below this speed (kn) the current card says "slack water". */
const SLACK_KN = 0.5

export interface Tides {
  tides: TidesContent
  /** Place of the current card (the current station can differ from the tide station) */
  currentPlace: string
  source: DataSource
}

/**
 * Tides: the live DFO predictions (TidesProvider) on top of the bundled sample, whose texts (explainer) are
 * kept. Null until the sample content has loaded.
 */
export function useTides(): Tides | null {
  const sample = useContent('tides')
  const live = useLiveTides()
  const { t, lang } = useLanguage()

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
