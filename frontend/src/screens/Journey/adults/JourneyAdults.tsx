import { lazy, Suspense, useState } from 'react'
import { AudienceToggle } from '../../../components/AudienceToggle/AudienceToggle'
import { LanguageButton } from '../../../components/LanguageButton/LanguageButton'
import { SampleChip } from '../../../components/SampleChip/SampleChip'
import { useKiosk } from '../../../context/KioskContext'
import { useContent } from '../../../hooks/useContent'
import { useLanguage } from '../../../i18n/LanguageContext'
import { useShip } from '../../../ship/ShipProvider'
import type { TrackKey } from '../../../types/feed'
import { SceneModeButton, ViewControls } from '../kids/ViewControls'
import { ArrivalCard } from './ArrivalCard'
import { AboutDataCard, HappeningCard, PlacePill } from './InfoCards'
import styles from './JourneyAdults.module.css'
import { ReadingsTable } from './ReadingsTable'
import { StatTiles } from './StatTiles'
import { TrackColourCard } from './TrackColourCard'
import { TrackMap } from './TrackMap'
import { crossingRows } from './trackColour'

const AdultsMap = lazy(() => import('../../../map/AdultsMap'))

/** Journey (Grown-ups): Ocean screen 1b. Data panel on the left, route map coloured by a reading on the right. */
export function JourneyAdults() {
  const { t } = useLanguage()
  const ship = useShip()
  const zones = useContent('zones')
  const readings = useContent('readings')
  const { sceneMode, setSceneMode, mapAvailable, view, setView } = useKiosk()
  const [trackKey, setTrackKey] = useState<TrackKey>('salinity')

  if (!ship || !zones || !readings) return <div className={styles.screen} />
  const { row, history, sailing } = ship
  const zone = zones[sailing.zoneId]
  const track = readings.tracks.find((tr) => tr.key === trackKey) ?? readings.tracks[0]
  const crossing = crossingRows(history)

  return (
    <div className={styles.screen}>
      <section className={styles.panel}>
        <div className={styles.head}>
          <div className={styles.headText}>
            <span className={styles.eyebrow}>{t(sailing.status === 'docked' ? 'journey.nextCrossing' : 'journey.nowCrossing')}</span>
            <span className={styles.title}>{sailing.from.name} → {sailing.to.name}</span>
          </div>
          <SampleChip show={ship.source === 'sample'} />
        </div>
        <StatTiles row={row} />
        <ArrivalCard sailing={sailing} />
        <ReadingsTable row={row} history={history} sailing={sailing} readings={readings} />
      </section>

      <section className={styles.mapArea}>
        <Suspense fallback={null}>
          {sceneMode === 'map' ? (
            <AdultsMap view={view} sailing={sailing} crossing={crossing} track={track} />
          ) : (
            <TrackMap row={row} sailing={sailing} crossing={crossing} track={track} />
          )}
        </Suspense>
        <PlacePill zone={zone} className={styles.pill} />
        <div className={styles.toggles}>
          <AudienceToggle variant="floating" />
          <LanguageButton variant="floating" />
        </div>
        <TrackColourCard tracks={readings.tracks} track={track} onSelect={setTrackKey} className={styles.colourBy} />
        <HappeningCard zone={zone} className={styles.happening} />
        <div className={styles.bottomRight}>
          {/* The map has the same camera buttons as Kids; the 2D sea map only needs the globe button. */}
          {sceneMode === 'map' ? (
            <ViewControls view={view} onView={setView} />
          ) : (
            mapAvailable && <SceneModeButton variant="floating" mode={sceneMode} onToggle={() => setSceneMode('map')} />
          )}
          <AboutDataCard />
        </div>
      </section>
    </div>
  )
}
