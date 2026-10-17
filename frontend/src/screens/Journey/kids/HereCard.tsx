import { PinIcon } from '../../../components/icons'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { ZoneText } from '../../../types/content'
import styles from './HereCard.module.css'

/** "You are here" pill and the zone blurb. */
export function HereCard({ zone, className }: { zone: ZoneText; className?: string }) {
  const { t } = useLanguage()
  return (
    <div className={`${styles.here} ${className ?? ''}`}>
      <div className={styles.pill}>
        <span className={styles.pin}><PinIcon /></span>
        <div>
          <small>{t('journey.youAreHere')}</small>
          <b>{zone.here}</b>
        </div>
      </div>
      <div className={styles.blurb}>{zone.blurb}</div>
    </div>
  )
}
