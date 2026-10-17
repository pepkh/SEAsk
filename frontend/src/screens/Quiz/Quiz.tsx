import { useState } from 'react'
import { useGuide, useGuideSpot } from '../../components/Guide/GuideContext'
import { ScreenFrame } from '../../components/ScreenFrame/ScreenFrame'
import { useContent } from '../../hooks/useContent'
import { useLanguage } from '../../i18n/LanguageContext'
import { AnswerPanel } from './AnswerPanel'
import { QuestionCard } from './QuestionCard'
import styles from './Quiz.module.css'
import { QuizDone } from './QuizDone'
import { ScoreCard } from './ScoreCard'

/** Ocean quiz: one question at a time, a score card, then a final score. The diver cheers or wobbles with each answer. */
export function Quiz() {
  const { t } = useLanguage()
  const quiz = useContent('quiz')
  const { react, say } = useGuide()
  useGuideSpot('header')
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
    const right = id === q.answer
    if (right) setScore((s) => s + 1)
    react(right ? 'happy' : 'no')
    say(t(right ? 'guide.quizRight' : 'guide.quizWrong'), 2500)
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
    <ScreenFrame title={t('quiz.title')} subtitle={t('quiz.subtitle')}>
      {q && !done && (
        <div className={styles.playing}>
          <QuestionCard question={q} index={qi} total={total} picked={picked} onPick={pick} />
          <div className={styles.side}>
            <ScoreCard score={score} total={total} />
            <AnswerPanel question={q} picked={picked} isLast={qi === total - 1} onNext={next} />
          </div>
        </div>
      )}
      {done && (
        <div className={styles.done}>
          <QuizDone score={score} total={total} onRestart={restart} />
        </div>
      )}
    </ScreenFrame>
  )
}
