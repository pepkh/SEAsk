import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/** Where the diver lives on the current screen. */
export type GuideSpot = 'welcome' | 'hub' | 'corner-right' | 'corner-left' | 'header' | 'hidden'

export interface TourStep {
  /** data-tour value of the element the diver stands next to */
  target: string
  text: string
}

interface GuideValue {
  spot: GuideSpot
  setSpot: (spot: GuideSpot) => void
  /** What the diver is saying (and where a fact in it comes from), or null */
  line: { text: string; source?: string; id: number } | null
  /** Say a line for `ms` (a new line replaces the old one); `source` is shown small under it */
  say: (text: string, ms?: number, source?: string) => void
  hush: () => void
  /** A whole-body reaction: a happy hop or a "no" wobble */
  reaction: { kind: 'happy' | 'no'; id: number } | null
  react: (kind: 'happy' | 'no') => void
  /** The guided tour, or null when there is none */
  tour: { steps: TourStep[]; step: number } | null
  startTour: (steps: TourStep[]) => void
  /** Next step, or the end after the last */
  nextTour: () => void
  endTour: () => void
}

const GuideContext = createContext<GuideValue | null>(null)

const LINE_MS = 5000
/** A tour step nobody moves on from (they walked away) ends the tour after this time (ms). */
const TOUR_ABANDON_MS = 30_000

/** State of the diver mascot: where it stands, what it says, how it reacts, and the tour. */
export function GuideProvider({ children }: { children: ReactNode }) {
  const [spot, setSpot] = useState<GuideSpot>('hidden')
  const [line, setLine] = useState<GuideValue['line']>(null)
  const [reaction, setReaction] = useState<GuideValue['reaction']>(null)
  const [tour, setTour] = useState<GuideValue['tour']>(null)
  const lineTimer = useRef<number | undefined>(undefined)
  const counter = useRef(0)

  const hush = useCallback(() => {
    window.clearTimeout(lineTimer.current)
    setLine(null)
  }, [])

  const say = useCallback((text: string, ms = LINE_MS, source?: string) => {
    window.clearTimeout(lineTimer.current)
    setLine({ text, source, id: ++counter.current })
    lineTimer.current = window.setTimeout(() => setLine(null), ms)
  }, [])

  const react = useCallback((kind: 'happy' | 'no') => setReaction({ kind, id: ++counter.current }), [])

  const startTour = useCallback((steps: TourStep[]) => setTour({ steps, step: 0 }), [])
  const endTour = useCallback(() => {
    setTour(null)
    hush()
  }, [hush])
  const nextTour = useCallback(() => {
    if (!tour) return
    if (tour.step + 1 < tour.steps.length) setTour({ ...tour, step: tour.step + 1 })
    else endTour()
  }, [tour, endTour])

  // Each step's line shows while the diver stands next to its target, until Next (or Skip).
  useEffect(() => {
    if (!tour) return
    say(tour.steps[tour.step].text, TOUR_ABANDON_MS)
    const id = window.setTimeout(endTour, TOUR_ABANDON_MS)
    return () => window.clearTimeout(id)
  }, [tour, say, endTour])

  useEffect(() => () => window.clearTimeout(lineTimer.current), [])

  const value = useMemo(
    () => ({ spot, setSpot, line, say, hush, reaction, react, tour, startTour, nextTour, endTour }),
    [spot, line, say, hush, reaction, react, tour, startTour, nextTour, endTour],
  )
  return <GuideContext value={value}>{children}</GuideContext>
}

// eslint-disable-next-line react/only-export-components
export function useGuide(): GuideValue {
  const value = useContext(GuideContext)
  if (!value) throw new Error('useGuide needs a GuideProvider')
  return value
}

/** Puts the diver at `spot` while the calling screen is shown. */
// eslint-disable-next-line react/only-export-components
export function useGuideSpot(spot: GuideSpot) {
  const { setSpot, endTour } = useGuide()
  useEffect(() => {
    setSpot(spot)
    return () => endTour()
  }, [spot, setSpot, endTour])
}
