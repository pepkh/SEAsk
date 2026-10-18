import { RECORDED_DAY } from '../../api/shipFeed'
import { formatDay } from '../../i18n/format'
import { useLanguage, type TKey } from '../../i18n/LanguageContext'
import styles from './SampleChip.module.css'

interface Props {
  variant?: 'outline' | 'overlay'
  /** Shown only while the screen shows the recorded day instead of live data */
  show?: boolean
  label?: TKey
}

/** "RECORDED 17 AUG 2026" chip: the numbers on screen are the ferry's real readings from that day, replayed. */
export function SampleChip({ variant = 'outline', show = true, label = 'sampleData' }: Props) {
  const { t, lang } = useLanguage()
  if (!show) return null
  return <span className={styles[variant]}>{t(label, { date: formatDay(RECORDED_DAY, lang).toUpperCase() })}</span>
}
