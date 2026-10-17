import { lazy, Suspense, useState } from 'react'
import { AudienceToggle } from '../../../components/AudienceToggle/AudienceToggle'
import { LanguageButton } from '../../../components/LanguageButton/LanguageButton'
import { SampleChip } from '../../../components/SampleChip/SampleChip'
import { useKiosk } from '../../../context/KioskContext'
import { useContent } from '../../../hooks/useContent'
import type { ViewName } from '../../../scene/constants'
import { useShip } from '../../../ship/ShipProvider'
import { DepthCard } from './DepthCard'
import { EtaCard } from './EtaCard'
import { HereCard } from './HereCard'
import styles from './JourneyKids.module.css'
import { LookoutCard } from './LookoutCard'
import { MiniRouteMap } from './MiniRouteMap'
import { ReadingTiles } from './ReadingTiles'
import { SpeedCard } from './SpeedCard'
import { ViewControls } from './ViewControls'

// Each 3D engine loads only when its mode is on.
const SeaScene = lazy(() => import('../../../scene/SeaScene'))
const KidsMap = lazy(() => import('../../../map/KidsMap'))

/** Journey (Kids): Home mockup. Full-bleed 3D scene with glass cards and the dock below. */
export function JourneyKids() {
  const ship = useShip()
  const zones = useContent('zones')
  const readings = useContent('readings')
  const { sceneMode } = useKiosk()
  const [view, setView] = useState<ViewName>('chase')
  const zone = ship && zones ? zones[ship.sailing.zoneId] : undefined

  return (
    <div className={styles.screen}>
      <div className={styles.canvas}>
        <Suspense fallback={null}>
          {sceneMode === 'map' ? <KidsMap view={view} /> : <SeaScene view={view} speedKn={ship?.row.speed_over_ground ?? 0} />}
        </Suspense>
      </div>
      <SampleChip variant="overlay" />
      {ship && zone && readings && (
        <div className={styles.hud}>
          <HereCard zone={zone} className={styles.here} />
          <div className={styles.toggles}>
            <AudienceToggle variant="glass" />
            <LanguageButton variant="glass" />
          </div>
          <div className={styles.left}>
            <SpeedCard row={ship.row} sailing={ship.sailing} />
            <EtaCard sailing={ship.sailing} zone={zone} />
            <ReadingTiles row={ship.row} readings={readings} />
          </div>
          <ViewControls view={view} onView={setView} className={styles.ctrls} />
          <LookoutCard lookout={zone.lookout} className={styles.lookout} />
          <div className={styles.right}>
            {sceneMode === 'sea' && <MiniRouteMap sailing={ship.sailing} place={zone.here} />}
            <DepthCard fraction={ship.sailing.fraction} />
          </div>
        </div>
      )}
    </div>
  )
}
