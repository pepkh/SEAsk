import { useLanguage } from '../../i18n/LanguageContext'
import styles from './ScoreCard.module.css'

/** Dark score card with one star for each correct answer. */
export function ScoreCard({ score, total }: { score: number; total: number }) {
  const { t } = useLanguage()
  return (
    <div className={styles.card}>
      <div className={styles.text}>
        <span className={styles.eyebrow}>{t('quiz.score')}</span>
        <span className={styles.score}>
          {score}
          <span> / {total}</span>
        </span>
      </div>
      <div className={styles.stars}>
        {Array.from({ length: total }, (_, i) => (
          <svg key={i} viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
            <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill={i < score ? '#F5C04A' : '#3A464D'} />
          </svg>
        ))}
      </div>
    </div>
  )
}
