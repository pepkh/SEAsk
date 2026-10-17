import { Outlet, useLocation } from 'react-router'
import { Guide } from '../components/Guide/Guide'
import { GuideProvider } from '../components/Guide/GuideContext'
import { StillThere } from '../components/StillThere/StillThere'
import { HUB_PATH } from '../components/WaterTransition/levels'
import { TransitionProvider, useTransition } from '../components/WaterTransition/TransitionContext'
import { TransitionOverlay } from '../components/WaterTransition/TransitionOverlay'
import { useSession } from '../context/SessionContext'
import { useUiScale } from '../hooks/useUiScale'
import { World } from '../world/World'
import styles from './KioskLayout.module.css'

/**
 * Layers, back to front: the live 3D world (only during a session), the current screen, the diver guide, the
 * transition picture, and the "Still there?" question.
 */
export function KioskLayout() {
  useUiScale()
  return (
    <GuideProvider>
      <TransitionProvider>
        <Shell />
      </TransitionProvider>
    </GuideProvider>
  )
}

function Shell() {
  const { active, id } = useSession()
  const { run } = useTransition()
  const { pathname } = useLocation()
  // The world draws on the ferry screen, and while the welcome bubble is about to pop (so the ferry is ready behind it).
  const paused = pathname !== HUB_PATH && run?.kind !== 'pop'

  return (
    <div className={styles.app}>
      {active && <World paused={paused} />}
      <main className={styles.main}>
        <Outlet />
      </main>
      <Guide />
      <TransitionOverlay />
      <StillThere key={id} />
    </div>
  )
}
