import { useState, type CSSProperties } from 'react'
import { uiScaleFor } from '../../hooks/useUiScale'
import { WelcomeArt } from '../../screens/Welcome/WelcomeArt'
import { RisingBubbles } from '../RisingBubbles/RisingBubbles'
import { diveCenter } from './diveBubble'
import { useTransition, type TransitionRun } from './TransitionContext'
import styles from './TransitionOverlay.module.css'

const DROPS = Array.from({ length: 9 }, (_, i) => ({ '--a': `${-80 + i * 20}deg`, '--h': `${60 + (i % 3) * 30}px` }) as CSSProperties)

/** The picture that covers the screen while the route changes (see levels.ts for the timings). */
export function TransitionOverlay() {
  const { run } = useTransition()
  if (!run) return null
  if (run.reduced) return <div className={`${styles.fade} ${styles[run.phase]}`} />

  switch (run.kind) {
    case 'pop':
      // The welcome screen itself shows the wobble; the overlay takes over to burst once the route has changed.
      return run.phase === 'reveal' ? <div className={styles.layer}><WelcomeArt mode="burst" /></div> : null
    case 'reform':
      return <div className={styles.layer}><WelcomeArt mode={run.phase === 'cover' ? 'reform' : 'idle'} /></div>
    default:
      return <Water key={`${run.kind}-${run.phase}`} run={run} />
  }
}

/** The water: it rises out of the Dive in bubble over the ferry when diving, and drops away when surfacing. */
function Water({ run }: { run: TransitionRun }) {
  // Where the diver lands (the middle of the Dive in bubble), read once: the splash and the waterline start there.
  const [splash] = useState(() => diveCenter(window.innerWidth, window.innerHeight, uiScaleFor(window.innerWidth, window.innerHeight)))
  const vars = { '--from': `${splash.y}px` } as CSSProperties
  const diving = run.kind === 'dive' && run.phase === 'cover'

  return (
    <div className={styles.layer} aria-hidden="true">
      <div className={`${styles.water} ${styles[`${run.kind}-${run.phase}`]}`} style={vars}>
        <svg className={styles.waveBack} viewBox="0 0 1440 100" preserveAspectRatio="none">
          <path d="M0 50 Q120 20 240 50 T480 50 T720 50 T960 50 T1200 50 T1440 50 V100 H0 Z" />
        </svg>
        <svg className={styles.waveFront} viewBox="0 0 1440 100" preserveAspectRatio="none">
          <path d="M0 60 Q120 34 240 60 T480 60 T720 60 T960 60 T1200 60 T1440 60 V100 H0 Z" />
        </svg>
        <div className={styles.rays} />
        <RisingBubbles count={26} seed={7} maxSize={0.022} speed={3.2} />
      </div>
      {diving && (
        <div className={styles.splash} style={{ left: splash.x, top: splash.y }}>
          <span className={styles.ring} />
          <span className={styles.ring2} />
          {DROPS.map((style, i) => <i key={i} style={style} />)}
        </div>
      )}
    </div>
  )
}
