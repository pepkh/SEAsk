import { useLanguage } from '../../../i18n/LanguageContext'
import type { ZoneText } from '../../../types/content'
import styles from './LookoutCard.module.css'

/** "Look out for …" pill with a round photo placeholder. */
export function LookoutCard({ lookout, className = '' }: { lookout: ZoneText['lookout']; className?: string }) {
  const { t } = useLanguage()
  return (
    <div className={`${styles.lookout} ${className}`}>
      <span className={styles.ph}>{t('photo', { name: lookout.photo })}</span>
      <div>
        <b>{lookout.title}</b>
        <span>{lookout.text}</span>
      </div>
    </div>
  )
}
