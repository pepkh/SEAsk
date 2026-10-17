import { useLanguage, type TKey } from '../../i18n/LanguageContext'
import styles from './SampleChip.module.css'

interface Props {
  variant?: 'outline' | 'overlay'
  /** Shown only while the screen shows sample data */
  show?: boolean
  label?: TKey
}

/** "SAMPLE DATA" chip. */
export function SampleChip({ variant = 'outline', show = true, label = 'sampleData' }: Props) {
  const { t } = useLanguage()
  if (!show) return null
  return <span className={styles[variant]}>{t(label)}</span>
}
