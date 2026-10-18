import { useState } from 'react'
import { BackButton } from '../../components/BackButton/BackButton'
import { useGuideSpot } from '../../components/Guide/GuideContext'
import { LanguageButton } from '../../components/LanguageButton/LanguageButton'
import { SampleChip } from '../../components/SampleChip/SampleChip'
import { useContent } from '../../hooks/useContent'
import { useRouteProfile } from '../../hooks/useRouteProfile'
import { useLanguage } from '../../i18n/LanguageContext'
import { binAt } from '../../ship/profile'
import { useShip } from '../../ship/ShipProvider'
import { useTides } from '../../tides/useTides'
import type { TrackKey } from '../../types/feed'
import { useWeather } from '../../weather/WeatherProvider'
import { ArrivalCard } from './ArrivalCard'
import { AboutDataCard, HappeningCard, PlacePill } from './InfoCards'
import styles from './Lab.module.css'
import { CurrentCard } from './outside/CurrentCard'
import { TideChart } from './outside/TideChart'
import { TidesExplainer } from './outside/TidesExplainer'
import { WeatherPanel } from './outside/WeatherPanel'
import { ReadingsTable } from './ReadingsTable'
import { RouteProfileCard } from './RouteProfileCard'
import { StatTiles } from './StatTiles'
import { TrackColourCard } from './TrackColourCard'
import { TrackMap } from './TrackMap'
import { crossingRows } from './trackColour'

type Tab = 'water' | 'outside'

/**
 * Ocean lab, for the curious: every live reading with its trend and quality, the track coloured by a reading, the
 * usual values along the route, and the full tide and weather detail. Same data as the ferry screen, as numbers.
 */
export function Lab() {
  const { t } = useLanguage()
  const ship = useShip()
  const zones = useContent('zones')
  const readings = useContent('readings')
  const profile = useRouteProfile()
  const tides = useTides()
  const weather = useWeather()
  const [trackKey, setTrackKey] = useState<TrackKey>('salinity')
  const [tab, setTab] = useState<Tab>('water')
  useGuideSpot('hidden')

  if (!ship || !zones || !readings) return <div className={styles.screen} />
  const { row, history, sailing } = ship
  const zone = zones[sailing.zoneId]
  const track = readings.tracks.find((tr) => tr.key === trackKey) ?? readings.tracks[0]
  const crossing = crossingRows(history)
  const digits = readings.items.find((item) => item.key === track.key)?.digits ?? 2

  return (
    <div className={styles.screen}>
      <section className={styles.panel}>
        <div className={styles.top}>
          <BackButton />
        </div>
        <div className={styles.head}>
          <div className={styles.headText}>
            <span className={styles.eyebrow}>{t(sailing.status === 'docked' ? 'journey.nextCrossing' : 'journey.nowCrossing')}</span>
            <span className={styles.title}>{t('lab.title')}</span>
            <span className={styles.route}>{sailing.from.name} → {sailing.to.name}</span>
          </div>
          <SampleChip show={ship.source === 'sample' || tides?.source === 'sample' || weather?.sources.weather === 'sample'} />
        </div>
        <div className={styles.tabs} role="tablist" aria-label={t('lab.tabs.label')}>
          {(['water', 'outside'] as const).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>
              {t(`lab.tabs.${value}`)}
            </button>
          ))}
        </div>
        {tab === 'water' ? (
          <div className={styles.content} role="tabpanel">
            <StatTiles row={row} />
            <ArrivalCard sailing={sailing} />
            <ReadingsTable row={row} history={history} sailing={sailing} readings={readings} />
          </div>
        ) : (
          <div className={styles.content} role="tabpanel">
            {tides && (
              <>
                <TideChart tides={tides.tides} now={tides.at} recorded={tides.source === 'sample'} />
                {tides.tides.current && <CurrentCard place={tides.currentPlace} current={tides.tides.current} recorded={tides.source === 'sample'} />}
                <TidesExplainer explainer={tides.tides.explainer} />
              </>
            )}
            {weather && <WeatherPanel weather={weather} />}
          </div>
        )}
      </section>

      <section className={styles.mapArea}>
        <TrackMap row={row} sailing={sailing} crossing={crossing} track={track} />
        <PlacePill zone={zone} className={styles.pill} />
        <div className={styles.toggles}>
          <LanguageButton variant="floating" />
        </div>
        <TrackColourCard tracks={readings.tracks} track={track} onSelect={setTrackKey} className={styles.colourBy} />
        <div className={styles.leftStack}>
          <RouteProfileCard profile={profile} track={track} digits={digits} row={row} sailing={sailing} zones={zones} />
          <HappeningCard zoneId={sailing.zoneId} zone={zone} usual={binAt(profile, sailing.fraction)} />
        </div>
        <div className={styles.bottomRight}>
          <AboutDataCard />
        </div>
      </section>
    </div>
  )
}
