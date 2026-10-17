import { useLanguage } from '../../i18n/LanguageContext'
import type { QuizQuestion } from '../../types/content'
import styles from './QuestionCard.module.css'

interface Props {
  question: QuizQuestion
  index: number
  total: number
  /** The picked option id, or null before an answer */
  picked: string | null
  onPick: (id: string) => void
}

/** Question, progress dots and four answer buttons. After a pick, the right answer shows green and a wrong pick red. */
export function QuestionCard({ question, index, total, picked, onPick }: Props) {
  const { t } = useLanguage()
  const answered = picked !== null

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <span className={styles.progress}>{t('quiz.progress', { num: index + 1, total })}</span>
        <div className={styles.dots}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < index ? styles.dotDone : i === index ? styles.dotNow : styles.dotNext} />
          ))}
        </div>
      </div>
      <span className={styles.question}>{question.text}</span>
      <div className={styles.answers}>
        {question.options.map(([id, text], i) => {
          const state = answered && id === question.answer ? styles.right : answered && id === picked ? styles.wrong : ''
          return (
            <button key={id} type="button" className={`${styles.answer} ${state}`} onClick={() => onPick(id)}>
              <span className={styles.badge}>{'ABCD'[i]}</span>
              <span>{text}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
