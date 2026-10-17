import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { HOME_SCENE, MAP_MODE_ENABLED } from '../config/env'
import { tilesAvailable } from '../map/tilesAvailable'
import type { ViewName } from '../scene/constants'

export type SceneMode = 'sea' | 'map'

interface KioskValue {
  /** Ferry screen background: the 3D sea scene or the Cesium map */
  sceneMode: SceneMode
  setSceneMode: (mode: SceneMode) => void
  /** Map mode is on and its offline tiles are there (shows the globe button). */
  mapAvailable: boolean
  /** Camera view of the 3D sea and the map */
  view: ViewName
  setView: (view: ViewName) => void
}

const KioskContext = createContext<KioskValue | null>(null)

/** Kiosk-wide choices that stay the same on all screens. */
export function KioskProvider({ children }: { children: ReactNode }) {
  const [sceneMode, setSceneMode] = useState<SceneMode>(HOME_SCENE)
  const [mapAvailable, setMapAvailable] = useState(MAP_MODE_ENABLED)
  const [view, setView] = useState<ViewName>('chase')

  // Without the offline tiles the map would be an empty globe, so use the sea.
  useEffect(() => {
    if (!MAP_MODE_ENABLED) return
    tilesAvailable().then((ok) => {
      if (ok) return
      console.warn('No offline map tiles in public/tiles, using the 3D sea.')
      setMapAvailable(false)
      setSceneMode('sea')
    })
  }, [])

  const value = useMemo(
    () => ({ sceneMode, setSceneMode, mapAvailable, view, setView }),
    [sceneMode, mapAvailable, view],
  )
  return <KioskContext value={value}>{children}</KioskContext>
}

// eslint-disable-next-line react/only-export-components
export function useKiosk(): KioskValue {
  const value = useContext(KioskContext)
  if (!value) throw new Error('useKiosk needs a KioskProvider')
  return value
}
