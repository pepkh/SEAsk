import { useCallback, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { useBridgeData, useBridgeUi, useSnapshot } from '../../../bridge/BridgeProvider'
import { useAsk } from '../../../qa/useAsk'
import { t } from '../strings'
import styles from './AskPanel.module.css'
import { CREW_QA, crewContext } from './crewQa'

const NO_MATCH = 'I can’t answer that one yet. In this preview I only know the questions above; free questions are coming with the full assistant.'

/**
 * "Ask the bridge": canned questions answered with the values at the playhead. A preview of the
 * assistant planned for later (POST /api/ask), behind the same QaProvider interface.
 */
export function AskPanel({ className }: { className: string }) {
  const ui = useBridgeUi()
  const snap = useSnapshot()
  const { day } = useBridgeData()
  // The answer uses the moment the question was asked: read the latest snapshot through a ref.
  const latest = useRef({ snap, day })
  useLayoutEffect(() => {
    latest.current = { snap, day }
  })
  const context = useCallback(() => crewContext(latest.current.snap, latest.current.day), [])
  const { ask, answer, shown, status } = useAsk(CREW_QA, context, NO_MATCH)
  const [text, setText] = useState('')

  if (!ui.askOpen) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim()) ask(text.trim())
    setText('')
  }

  return (
    <aside className={`${styles.panel} ${className}`} aria-label="Ask the bridge">
      <header className={styles.head}>
        <h2>Ask the bridge</h2>
        <span className={styles.preview}>Preview · canned answers</span>
        <button type="button" className={styles.close} onClick={() => ui.setAskOpen(false)} aria-label="Close">
          ×
        </button>
      </header>

      <div className={styles.chips}>
        {CREW_QA.map((q) => (
          <button key={q.id} type="button" aria-pressed={answer?.id === q.id && status !== 'idle'} onClick={() => ask(q)}>
            {q.question}
          </button>
        ))}
      </div>

      {status !== 'idle' && (
        <article className={styles.answer} aria-live="polite">
          {answer && <p className={styles.question}>{answer.question}</p>}
          {status === 'thinking' ? (
            <p className={styles.thinking}>
              <i />
              <i />
              <i />
            </p>
          ) : (
            <p className={styles.text}>{shown}</p>
          )}
          {status === 'done' && answer && (
            <>
              {answer.sources.length > 0 && (
                <ul className={styles.sources}>
                  {answer.sources.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
              <p className={styles.advisory}>{t('advisory')}</p>
            </>
          )}
        </article>
      )}

      <form className={styles.form} onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a question (preview: matched to the ones above)"
          aria-label="Your question"
        />
        <button type="submit" disabled={!text.trim()}>
          Ask
        </button>
      </form>
      <p className={styles.footnote}>Coming next: free questions answered by an assistant that reads the same ONC, DFO and weather data as this screen.</p>
    </aside>
  )
}
