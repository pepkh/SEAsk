import { FactSource } from '../../../components/SourceLine/FactSource'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { TidesContent } from '../../../types/content'
import styles from './TidesCards.module.css'

/** White card: why there are tides, with the Earth and Moon drawing. */
export function TidesExplainer({ explainer }: { explainer: TidesContent['explainer'] }) {
  const { t } = useLanguage()
  return (
    <div className={styles.card}>
      <svg viewBox="0 0 200 120" className={styles.moon} role="img" aria-label={t('tides.moonPullLabel')}>
        <ellipse cx="66" cy="60" rx="56" ry="44" fill="#CFE3F7" />
        <circle cx="66" cy="60" r="38" fill="#4D8B6B" />
        <path d="M44 44 Q60 36 72 48 Q84 58 74 70 Q60 80 48 70 Q38 58 44 44 Z" fill="#6FA785" />
        <circle cx="176" cy="60" r="14" fill="#D9DDDF" stroke="#B7BEC1" strokeWidth="2" />
        <path d="M126 60 L156 60" stroke="#5D676D" strokeWidth="2" strokeDasharray="4 4" />
        <text x="176" y="94" textAnchor="middle" fontFamily="Outfit, sans-serif" fontSize="12" fill="#5D676D">{t('tides.moon')}</text>
      </svg>
      <div className={styles.text}>
        <span className={styles.eyebrow}>{t('tides.whyTides')}</span>
        <span className={`${styles.title} ${styles.titleSmall}`}>{explainer.title}</span>
        <span className={styles.body}>{explainer.text}</span>
        <FactSource sourceKey="tides.explainer" />
      </div>
    </div>
  )
}
