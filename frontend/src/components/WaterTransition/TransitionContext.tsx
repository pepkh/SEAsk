import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { useSession } from '../../context/SessionContext'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useLanguage } from '../../i18n/LanguageContext'
import { worldState } from '../../world/ready'
import { kindOf, levelOf, REDUCED, TIMING, WORLD_WAIT_MS, type TransitionKind } from './levels'

export interface TransitionRun {
  kind: Exclude<TransitionKind, 'morph'>
  /** cover: before the route changes; reveal: after */
  phase: 'cover' | 'reveal'
  /** performance.now() when the phase started */
  startedAt: number
  /** Short fades instead of the full animation */
  reduced: boolean
}

interface TransitionValue {
  /** Go to a screen with the transition that fits (pop, reform, dive, surface, or a crossfade). */
  go: (to: string) => void
  /** The transition playing now, or null */
  run: TransitionRun | null
}

const TransitionContext = createContext<TransitionValue | null>(null)

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Resolves when the 3D world has drawn its first frame, or after `max` ms. */
async function worldReady(max: number) {
  const until = performance.now() + max
  while (!worldState.ready && performance.now() < until) await wait(50)
}

/**
 * Navigation with one consistent animation per kind of move (see levels.ts). The route changes while the
 * screen is fully covered, so loading never shows. Taps are ignored while a transition plays.
 */
export function TransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const session = useSession()
  const { setLang } = useLanguage()
  const reducedMotion = useReducedMotion()
  const [run, setRun] = useState<TransitionRun | null>(null)
  const busy = useRef(false)
  /** The path this provider navigated to last; any other change came from outside (browser back, a typed URL). */
  const expected = useRef(pathname)
  const current = useRef(pathname)
  useEffect(() => {
    current.current = pathname
  }, [pathname])

  // Keep the session in step with the URL when the route changes from outside (and on first load):
  // the welcome screen never has a session, every other screen always has one.
  useEffect(() => {
    if (pathname === expected.current && busy.current) return
    expected.current = pathname
    if (levelOf(pathname) === 'welcome') {
      if (session.active) {
        session.end()
        setLang('en')
      }
    } else if (!session.active) {
      session.start()
    }
  }, [pathname, session, setLang])

  const go = useCallback(
    (to: string) => {
      const from = current.current
      if (busy.current || to === from) return
      const kind = kindOf(from, to)

      if (kind === 'morph') {
        expected.current = to
        const start = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition
        if (start && !reducedMotion) start.call(document, () => flushSync(() => navigate(to)))
        else navigate(to)
        return
      }

      busy.current = true
      const timing = reducedMotion ? REDUCED : TIMING[kind]
      const play = async () => {
        if (kind === 'pop') session.start()
        setRun({ kind, phase: 'cover', startedAt: performance.now(), reduced: reducedMotion })
        await wait(timing.cover)
        if (kind === 'pop') await worldReady(WORLD_WAIT_MS)
        expected.current = to
        navigate(to)
        if (kind === 'reform') {
          session.end()
          setLang('en')
        }
        setRun({ kind, phase: 'reveal', startedAt: performance.now(), reduced: reducedMotion })
        await wait(timing.reveal)
        setRun(null)
        busy.current = false
      }
      play()
    },
    [navigate, reducedMotion, session, setLang],
  )

  const value = useMemo(() => ({ go, run }), [go, run])
  return <TransitionContext value={value}>{children}</TransitionContext>
}

// eslint-disable-next-line react/only-export-components
export function useTransition(): TransitionValue {
  const value = useContext(TransitionContext)
  if (!value) throw new Error('useTransition needs a TransitionProvider')
  return value
}
