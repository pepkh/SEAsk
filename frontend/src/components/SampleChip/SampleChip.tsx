import { USE_MOCKS } from '../../config/env'
import { useLanguage } from '../../i18n/LanguageContext'
import styles from './SampleChip.module.css'

/** "SAMPLE DATA". Shown only while the kiosk uses mock data. */
export function SampleChip({ variant = 'outline' }: { variant?: 'outline' | 'overlay' }) {
  const { t } = useLanguage()
  if (!USE_MOCKS) return null
  return <span className={styles[variant]}>{t('sampleData')}</span>
}
