import { Link } from 'react-router'
import { useLanguage } from '../../../i18n/LanguageContext'
import { depthAt } from '../../../ship/slice'
import styles from './DepthCard.module.css'

/** Dark "Under the ship" card. It opens the Seafloor screen. */
export function DepthCard({ fraction }: { fraction: number }) {
  const { t } = useLanguage()
  return (
    <Link to="/seafloor" className={styles.depth}>
      <div>
        <small>{t('journey.underShip')}</small>
        <b>
          {depthAt(fraction)} <span>{t('journey.mOfWater')}</span>
        </b>
      </div>
      <span className={styles.go}>{t('journey.diveDown')}</span>
    </Link>
  )
}
