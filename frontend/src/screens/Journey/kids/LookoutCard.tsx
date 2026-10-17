import { Photo } from '../../../components/Photo/Photo'
import { photoCredit } from '../../../components/Photo/photos'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { ZoneText } from '../../../types/content'
import styles from './LookoutCard.module.css'

/** "Look out for …" pill with a round photo; its credit goes under the text. */
export function LookoutCard({ lookout, className = '' }: { lookout: ZoneText['lookout']; className?: string }) {
  const { t } = useLanguage()
  const credit = photoCredit(lookout.photoId)
  return (
    <div className={`${styles.lookout} ${className}`}>
      <Photo id={lookout.photoId} alt={lookout.photo} placeholder={t('photo', { name: lookout.photo })} className={styles.ph} showCredit={false} />
      <div>
        <b>{lookout.title}</b>
        <span>{lookout.text}</span>
        {credit && <small className={styles.credit}>{credit}</small>}
      </div>
    </div>
  )
}
