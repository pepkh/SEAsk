import { lazy, Suspense, useEffect } from 'react'
import { useKiosk } from '../context/KioskContext'
import { useShip, useTimeShift } from '../ship/ShipProvider'
import { markWorldReady } from './ready'
import styles from './World.module.css'

// Each 3D engine loads only when its mode is on (the welcome screen prefetches the one in use).
const SeaScene = lazy(() => import('../scene/SeaScene'))
const KidsMap = lazy(() => import('../map/KidsMap'))

/**
 * The live 3D world behind the ferry screen: the sea scene or the Cesium map. It exists only during a visitor
 * session, and stops drawing (`paused`) while another screen covers it, so coming back to the ferry is instant.
 */
export function World({ paused }: { paused: boolean }) {
  const ship = useShip()
  const { sceneMode, view, mapAvailable } = useKiosk()
  // The 3D sea isn't tied to real places, so a rewind shows on the map (when there is one).
  const rewound = useTimeShift().at !== null
  const mode = rewound && mapAvailable ? 'map' : sceneMode

  // A new scene reports ready again on its first frame.
  useEffect(() => {
    markWorldReady(false)
    return () => markWorldReady(false)
  }, [mode])

  return (
    <div className={styles.world} aria-hidden={paused}>
      <Suspense fallback={null}>
        {mode === 'map' ? (
          <KidsMap view={view} paused={paused} />
        ) : (
          <SeaScene view={view} speedKn={ship?.row.speed_over_ground ?? 0} paused={paused} />
        )}
      </Suspense>
    </div>
  )
}
