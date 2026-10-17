import { useEffect, useState } from 'react'
import { useSession } from '../../context/SessionContext'
import { useIdle } from '../../hooks/useIdle'
import { useLanguage } from '../../i18n/LanguageContext'
import { useGuide } from '../Guide/GuideContext'
import { useTransition } from '../WaterTransition/TransitionContext'
import styles from './StillThere.module.css'

/** With no touch for this long during a session, the kiosk asks if someone is still there (ms)… */
export const IDLE_ASK_MS = 75_000
/** …and goes back to the welcome screen after this countdown (ms). */
const COUNTDOWN_MS = 10_000

/**
 * "Still there? Tap to keep exploring", with a countdown ring. A tap keeps the session; otherwise the session
 * ends and the welcome bubble re-forms (language back to English, no more data requests).
 */
export function StillThere() {
  const { t } = useLanguage()
  const { active } = useSession()
  const { go, run } = useTransition()
  const { say } = useGuide()
  const [asking, setAsking] = useState(false)

  useIdle(IDLE_ASK_MS, () => setAsking(true), active && !run && !asking)

  useEffect(() => {
    if (!asking) return
    say(t('guide.stillThere'), COUNTDOWN_MS)
    const id = setTimeout(() => {
      setAsking(false)
      say(t('guide.bye'), 2500)
      go('/')
    }, COUNTDOWN_MS)
    return () => clearTimeout(id)
  }, [asking, go, say, t])

  // The layout gives each session its own StillThere (key), so a session that ends some other way takes the question with it.
  if (!asking || !active) return null
  return (
    <div className={styles.overlay} onPointerDown={() => setAsking(false)} role="alertdialog" aria-label={t('guide.stillThere')}>
      <button type="button" className={styles.bubble} onClick={() => setAsking(false)}>
        <svg viewBox="0 0 120 120" className={styles.ring} aria-hidden="true">
          <circle cx="60" cy="60" r="54" className={styles.track} />
          <circle cx="60" cy="60" r="54" className={styles.left} style={{ animationDuration: `${COUNTDOWN_MS}ms` }} />
        </svg>
        <b>{t('guide.stillThere')}</b>
        <span>{t('guide.keepExploring')}</span>
      </button>
    </div>
  )
}
