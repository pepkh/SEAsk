import { Photo } from '../../components/Photo/Photo'
import { FactSource } from '../../components/SourceLine/FactSource'
import { useLanguage } from '../../i18n/LanguageContext'
import type { QuizQuestion } from '../../types/content'
import styles from './AnswerPanel.module.css'

interface Props {
  question: QuizQuestion
  /** Place in quiz.json (its sources are under "quiz.{index}") */
  index: number
  picked: string | null
  isLast: boolean
  onNext: () => void
}

/** Before an answer: a hint. After an answer: the verdict, the explanation and the next button. */
export function AnswerPanel({ question, index, picked, isLast, onNext }: Props) {
  const { t } = useLanguage()

  if (picked === null) {
    return (
      <div className={styles.hint}>
        <svg viewBox="0 0 24 24" width="56" height="56" fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18h6" />
          <path d="M10 21h4" />
          <path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" />
        </svg>
        <span className={styles.hintTitle}>{t('quiz.hint')}</span>
        <span className={styles.hintText}>{question.hint}</span>
      </div>
    )
  }

  const correct = picked === question.answer
  return (
    <div className={styles.answered}>
      <Photo id={question.picId} alt={question.pic} placeholder={t('quiz.illustration', { pic: question.pic })} className={styles.picture} />
      <div className={styles.body}>
        <span className={`${styles.verdict} ${correct ? styles.correct : styles.wrong}`}>
          {t(correct ? 'quiz.correct' : 'quiz.wrong')}
        </span>
        <span className={styles.why}>{question.why}</span>
        <FactSource sourceKey={`quiz.${index}`} />
        <button type="button" className={styles.next} onClick={onNext}>
          {t(isLast ? 'quiz.seeScore' : 'quiz.next')}
        </button>
      </div>
    </div>
  )
}
