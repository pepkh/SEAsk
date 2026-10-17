import { useLanguage } from '../../i18n/LanguageContext'
import { HUB_PATH } from '../WaterTransition/levels'
import { useTransition } from '../WaterTransition/TransitionContext'
import styles from './BackButton.module.css'

const ShipIcon = () => (
  <svg viewBox="0 0 32 32" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h24l-3.5 6h-17z" />
    <path d="M8 20v-6h16v6" />
    <path d="M12 14v-4h8v4" />
    <path d="M15 10V6" />
  </svg>
)

const UpIcon = () => (
  <svg viewBox="0 0 32 32" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 26V7" />
    <path d="M8 14l8-8 8 8" />
  </svg>
)

/**
 * The big round way back to the ferry, top left on every inner screen. Under the water (Dive) it reads
 * "↑ Surface", so the direction matches the animation.
 */
export function BackButton({ variant = 'ferry' }: { variant?: 'ferry' | 'surface' }) {
  const { t } = useLanguage()
  const { go } = useTransition()
  const surface = variant === 'surface'
  return (
    <button type="button" className={`${styles.back} ${surface ? styles.deep : ''}`} onClick={() => go(HUB_PATH)}>
      <span className={styles.orb}>{surface ? <UpIcon /> : <ShipIcon />}</span>
      <span className={styles.label}>{t(surface ? 'nav.surface' : 'nav.backToFerry')}</span>
    </button>
  )
}
