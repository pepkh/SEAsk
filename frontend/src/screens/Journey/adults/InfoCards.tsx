import { PinIcon } from '../../../components/icons'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { ZoneText } from '../../../types/content'
import styles from './InfoCards.module.css'

/** Zone pill on the Grown-ups map (dark pin). */
export function PlacePill({ zone, className = '' }: { zone: ZoneText; className?: string }) {
  return (
    <div className={`${styles.pill} ${className}`}>
      <span className={styles.pin}><PinIcon size={20} /></span>
      <div className={styles.pillText}>
        <span className={styles.pillEyebrow}>{zone.here}</span>
        <span className={styles.pillTitle}>{zone.adultTitle}</span>
      </div>
    </div>
  )
}

/** "What's happening here" for the current zone. */
export function HappeningCard({ zone, className = '' }: { zone: ZoneText; className?: string }) {
  const { t } = useLanguage()
  return (
    <div className={`${styles.happening} ${className}`}>
      <span className={styles.eyebrow}>{t('journey.happening')}</span>
      <span className={styles.title}>{zone.happening.title}</span>
      <p>{zone.happening.text}</p>
    </div>
  )
}

/** Dark "About the data" card. */
export function AboutDataCard() {
  const { t } = useLanguage()
  return (
    <div className={styles.about}>
      <span className={styles.eyebrow}>{t('journey.aboutData')}</span>
      <p>{t('journey.aboutDataText')}</p>
      <span className={styles.note}>{t('journey.qcNote')}</span>
    </div>
  )
}
