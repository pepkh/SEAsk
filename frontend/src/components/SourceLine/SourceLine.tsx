import { RECORDED_DAY } from '../../api/shipFeed'
import { SOURCES, type SourceId } from '../../config/sources'
import { formatDay } from '../../i18n/format'
import { useLanguage } from '../../i18n/LanguageContext'
import styles from './SourceLine.module.css'

interface Props {
  /** Providers of the numbers above (src/config/sources.ts); each is named once */
  ids: SourceId[]
  /** The full credit line of each provider, else its short name */
  full?: boolean
  /** The numbers are the recorded day's, not live: says so, with the date */
  recorded?: boolean
  className?: string
}

/** A small read-only line under data: where the numbers come from, and the day when they are not live. */
export function SourceLine({ ids, full = false, recorded = false, className = '' }: Props) {
  const { t, lang } = useLanguage()
  const parts = [...new Set(ids)].map((id) => (full ? SOURCES[id].credit[lang] : SOURCES[id].short[lang]))
  if (recorded) parts.push(t('credits.recorded', { date: formatDay(RECORDED_DAY, lang) }))
  return <small className={`${styles.line} ${className}`}>{parts.join(' · ')}</small>
}
