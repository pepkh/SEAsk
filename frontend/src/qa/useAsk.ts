import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { createMockProvider } from './mockProvider'
import type { QaAnswer, QaContext, QaItem, QaProvider } from './types'

export type AskStatus = 'idle' | 'thinking' | 'answering' | 'done'

/** How long the mock "thinks", and how fast words appear (like a streamed answer). */
const THINK_MS = 450
const WORD_MS = 28

/**
 * Asks a question and reveals the answer word by word (at once with reduced motion). The provider
 * is the canned mock today; VITE_QA=api will select the real assistant once /api/ask exists.
 */
export function useAsk(items: QaItem[], context: () => QaContext, noMatch: string) {
  const reduced = useReducedMotion()
  const [provider] = useState<QaProvider>(() => createMockProvider(noMatch))
  const [answer, setAnswer] = useState<QaAnswer | null>(null)
  const [shown, setShown] = useState('')
  const [status, setStatus] = useState<AskStatus>('idle')
  const timers = useRef<number[]>([])

  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }
  useEffect(() => clear, [])

  const ask = useCallback(
    (question: QaItem | string) => {
      clear()
      setStatus('thinking')
      setShown('')
      const ctx = context()
      timers.current.push(
        window.setTimeout(async () => {
          const a = await provider.ask(question, items, ctx)
          setAnswer(a)
          if (reduced) {
            setShown(a.text)
            setStatus('done')
            return
          }
          setStatus('answering')
          const parts = a.text.split(/(\s+)/)
          parts.forEach((_, i) => {
            timers.current.push(
              window.setTimeout(() => {
                setShown(parts.slice(0, i + 1).join(''))
                if (i === parts.length - 1) setStatus('done')
              }, (i / 2) * WORD_MS),
            )
          })
        }, reduced ? 0 : THINK_MS),
      )
    },
    [context, items, provider, reduced],
  )

  const reset = useCallback(() => {
    clear()
    setAnswer(null)
    setShown('')
    setStatus('idle')
  }, [])

  return { ask, reset, answer, shown, status }
}
