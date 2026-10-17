import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { HOME_SCENE } from '../config/env'

export type Audience = 'kids' | 'adults'
export type SceneMode = 'sea' | 'map'

interface KioskValue {
  audience: Audience
  setAudience: (audience: Audience) => void
  /** Journey background: the 3D sea scene or the Cesium map */
  sceneMode: SceneMode
  setSceneMode: (mode: SceneMode) => void
}

const KioskContext = createContext<KioskValue | null>(null)

/** Kiosk-wide choices that stay the same on all tabs. */
export function KioskProvider({ children }: { children: ReactNode }) {
  const [audience, setAudience] = useState<Audience>('kids')
  const [sceneMode, setSceneMode] = useState<SceneMode>(HOME_SCENE)
  const value = useMemo(() => ({ audience, setAudience, sceneMode, setSceneMode }), [audience, sceneMode])
  return <KioskContext value={value}>{children}</KioskContext>
}

// eslint-disable-next-line react/only-export-components
export function useKiosk(): KioskValue {
  const value = useContext(KioskContext)
  if (!value) throw new Error('useKiosk needs a KioskProvider')
  return value
}
