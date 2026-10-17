import { Link } from 'react-router'
import { useLanguage } from '../../i18n/LanguageContext'
import styles from './SpottedCard.module.css'

/** "Spotted something?" call to action. The sighting log is not designed yet, so it opens Journey (as in the mockup). */
export function SpottedCard() {
  const { t } = useLanguage()
  return (
    <Link to="/journey" className={styles.card}>
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4-4" />
        <path d="M11 8v6M8 11h6" />
      </svg>
      <div className={styles.text}>
        <span className={styles.title}>{t('seaLife.spotted')}</span>
        <span className={styles.body}>{t('seaLife.spottedText')}</span>
      </div>
    </Link>
  )
}
