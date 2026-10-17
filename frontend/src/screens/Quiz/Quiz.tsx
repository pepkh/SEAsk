import { useState } from 'react'
import { AudienceToggle } from '../../components/AudienceToggle/AudienceToggle'
import { LanguageButton } from '../../components/LanguageButton/LanguageButton'
import { PageHeader } from '../../components/PageHeader/PageHeader'
import { useContent } from '../../hooks/useContent'
import { useLanguage } from '../../i18n/LanguageContext'
import { AnswerPanel } from './AnswerPanel'
import { QuestionCard } from './QuestionCard'
import styles from './Quiz.module.css'
import { QuizDone } from './QuizDone'
import { ScoreCard } from './ScoreCard'

/** Ocean quiz: one question at a time, a score card, then a final score. */
export function Quiz() {
  const { t } = useLanguage()
  const quiz = useContent('quiz')
  const [qi, setQi] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [score, setScore] = useState(0)

  const questions = quiz?.questions ?? []
  const total = questions.length
  const done = total > 0 && qi >= total
  const q = questions[Math.min(qi, total - 1)]

  const pick = (id: string) => {
    if (picked !== null) return
    setPicked(id)
    if (id === q.answer) setScore((s) => s + 1)
  }
  const next = () => {
    setQi((i) => i + 1)
    setPicked(null)
  }
  const restart = () => {
    setQi(0)
    setPicked(null)
    setScore(0)
  }

  return (
    <div className={styles.screen}>
      <section className={styles.section}>
        <PageHeader title={t('quiz.title')} subtitle={t('quiz.subtitle')}>
          <div className={styles.controls}>
            <AudienceToggle variant="plain" adultsOpensJourney />
            <LanguageButton variant="plain" />
          </div>
        </PageHeader>
        {q && !done && (
          <div className={styles.playing}>
            <QuestionCard question={q} index={qi} total={total} picked={picked} onPick={pick} />
            <div className={styles.side}>
              <ScoreCard score={score} total={total} />
              <AnswerPanel question={q} picked={picked} isLast={qi === total - 1} onNext={next} />
            </div>
          </div>
        )}
        {done && <QuizDone score={score} total={total} onRestart={restart} />}
      </section>
    </div>
  )
}
