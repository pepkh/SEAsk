import { useLanguage } from '../../i18n/LanguageContext'
import type { SpeciesGroup } from '../../types/content'
import styles from './FilterPills.module.css'

const FILTERS = ['all', 'mammals', 'fish', 'invertebrates', 'seaweed'] as const

/** All / Mammals / Fish / Invertebrates / Seaweed. */
export function FilterPills({ value, onChange }: { value: SpeciesGroup | 'all'; onChange: (v: SpeciesGroup | 'all') => void }) {
  const { t } = useLanguage()
  return (
    <div className={styles.pills} role="group" aria-label={t('seaLife.filterLabel')}>
      {FILTERS.map((f) => (
        <button key={f} type="button" aria-pressed={value === f} onClick={() => onChange(f)}>
          {t(`seaLife.filters.${f}`)}
        </button>
      ))}
    </div>
  )
}
