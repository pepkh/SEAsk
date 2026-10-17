import type { CSSProperties } from 'react'
import { Logo } from '../../components/Logo/Logo'
import { RisingBubbles } from '../../components/RisingBubbles/RisingBubbles'
import { useLanguage } from '../../i18n/LanguageContext'
import styles from './WelcomeArt.module.css'

/** idle: waiting; wobble: just tapped; burst: popping open onto the ferry; reform: coming back together. */
export type WelcomeMode = 'idle' | 'wobble' | 'burst' | 'reform'

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  '--a': `${(i / 18) * 360 + (i % 3) * 7}deg`,
  '--r': `${380 + (i % 4) * 90}px`,
  '--s': `${26 + (i % 5) * 12}px`,
}) as CSSProperties)

interface Props {
  mode: WelcomeMode
  /** Given on the welcome screen (the big bubble is a button); left out on the transition overlay (a picture of it) */
  onStart?: () => void
}

/**
 * The welcome picture: a light sky and sea drawn in CSS (no WebGL, so it costs almost nothing while the kiosk
 * waits), and one big bubble: "Welcome to SEAsk · Touch to explore". The transition overlay draws the same picture,
 * so the pop and the re-form line up exactly with the screen.
 */
export function WelcomeArt({ mode, onStart }: Props) {
  const { t } = useLanguage()
  const content = (
    <>
      <span className={styles.hello}>{t('welcome.title')}</span>
      <Logo height={170} className={styles.logo} />
      <span className={styles.touch}>{t('welcome.touch')}</span>
      <span className={styles.other}>{t('welcome.touchOther')}</span>
    </>
  )

  return (
    <div className={`${styles.art} ${styles[mode]}`} onClick={onStart}>
      <div className={styles.sea}>
        <svg className={styles.waveBack} viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 60 Q180 20 360 60 T720 60 T1080 60 T1440 60 V120 H0 Z" />
        </svg>
        <svg className={styles.waveFront} viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 70 Q180 35 360 70 T720 70 T1080 70 T1440 70 V120 H0 Z" />
        </svg>
        <RisingBubbles count={16} seed={3} maxSize={0.018} speed={9} />
      </div>
      <div className={styles.center}>
        {onStart ? (
          <button type="button" className={styles.bubble} aria-label={t('welcome.start')}>
            {content}
          </button>
        ) : (
          <div className={styles.bubble} aria-hidden="true">
            {content}
          </div>
        )}
        <span className={styles.particles} aria-hidden="true">
          {PARTICLES.map((style, i) => <i key={i} style={style} />)}
        </span>
      </div>
    </div>
  )
}
