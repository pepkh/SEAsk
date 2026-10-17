import { useTransition } from '../../components/WaterTransition/TransitionContext'
import { useLanguage } from '../../i18n/LanguageContext'
import styles from './QuizDone.module.css'

/** Final score with "Play again" and "Meet the animals". */
export function QuizDone({ score, total, onRestart }: { score: number; total: number; onRestart: () => void }) {
  const { t } = useLanguage()
  const { go } = useTransition()
  const finalLine = score === total ? 'quiz.finalAll' : score >= 3 ? 'quiz.finalGood' : 'quiz.finalTry'

  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>{t('quiz.complete')}</span>
      <span className={styles.score}>
        {score}
        <span> / {total}</span>
      </span>
      <span className={styles.line}>{t(finalLine)}</span>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onRestart}>
          {t('quiz.playAgain')}
        </button>
        <button type="button" className={styles.secondary} onClick={() => go('/dive')}>
          {t('quiz.meetAnimals')}
        </button>
      </div>
    </div>
  )
}
