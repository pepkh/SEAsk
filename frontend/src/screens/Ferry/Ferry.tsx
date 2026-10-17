import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'
import { Bubble } from '../../components/Bubble/Bubble'
import { useGuide, useGuideSpot } from '../../components/Guide/GuideContext'
import { LiveBar } from '../../components/LiveBar/LiveBar'
import { fractionAt } from '../../components/RouteMap/geometry'
import { useTransition } from '../../components/WaterTransition/TransitionContext'
import { useContent } from '../../hooks/useContent'
import { useIdle } from '../../hooks/useIdle'
import { useLanguage } from '../../i18n/LanguageContext'
import { recordedFrom, timeAtFraction } from '../../ship/crossing'
import { zoneAt } from '../../ship/sailing'
import { useLiveShip, useShip, useTimeShift } from '../../ship/ShipProvider'
import { DiveBubble } from './DiveBubble'
import styles from './Ferry.module.css'
import { NowCard } from './NowCard'
import { RouteMapBubble } from './RouteMapBubble'
import { MAP_VIEW } from './routeMapView'
import { ViewBubble } from './ViewBubble'

/** With no touch for this long, the diver suggests something to do (ms). */
const PROMPT_MS = 45_000
/** A rewind with no touch for this long goes back to live (ms), before anything else times out. */
const REWIND_IDLE_MS = 45_000
/** A touch this close to the drawn route (screen px) counts as on it. */
const HIT_PX = 60
/** While dragging along the route, rewind at most this often (ms). */
const DRAG_MS = 120
/** From the keyboard (no touch point), the route map rewinds this far (ms). */
const KEY_REWIND_MS = 10 * 60_000
const PROMPTS = ['guide.prompt.map', 'guide.prompt.dive', 'guide.prompt.quiz', 'guide.prompt.tour'] as const

/** A star medal: the quiz gives you stars. */
const MedalIcon = () => (
  <svg viewBox="0 0 48 48" width="60" height="60" aria-hidden="true">
    <path d="M16 30 L11 45 L18 42 L22 47 L26 33 Z" fill="#7FC4D8" />
    <path d="M32 30 L37 45 L30 42 L26 47 L22 33 Z" fill="#4f97b0" />
    <circle cx="24" cy="20" r="14" fill="#F5C04A" stroke="#d99a1e" strokeWidth="2" />
    <path d="M24.0 12.0 L26.0 17.2 L31.6 17.5 L27.2 21.1 L28.7 26.5 L24.0 23.4 L19.3 26.5 L20.8 21.1 L16.4 17.5 L22.0 17.2 Z" fill="#fff" />
  </svg>
)

const SparkIcon = () => (
  <svg viewBox="0 0 32 32" width="52" height="52" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 22l6-7 5 4 6-10 4 5 5-6" />
    <path d="M3 28h26" stroke="var(--muted)" strokeWidth="2" />
  </svg>
)

/**
 * The ferry (hub of a session): the live 3D world fills the screen behind (see world/World.tsx), with one card in
 * the corner and a few bubbles around the ferry. The diver stands on the deck.
 */
export function Ferry() {
  const { t, toggle } = useLanguage()
  const ship = useShip()
  const liveShip = useLiveShip()
  const timeShift = useTimeShift()
  const zones = useContent('zones')
  const { go, run } = useTransition()
  const { say } = useGuide()
  useGuideSpot('hub')
  const prompt = useRef(0)

  // Arriving from the welcome screen: say hello once the bubble has popped.
  const arrivedByPop = useRef(run?.kind === 'pop')
  useEffect(() => {
    if (!arrivedByPop.current) return
    const id = setTimeout(() => say(t('guide.aboard'), 3500), 700)
    return () => clearTimeout(id)
  }, [say, t])

  const rewound = timeShift.at !== null
  useIdle(PROMPT_MS, () => say(t(PROMPTS[prompt.current++ % PROMPTS.length])), !run && !rewound)
  useIdle(REWIND_IDLE_MS, timeShift.goLive, rewound)

  // Back to live (Go Live, or caught up with now): the diver says so.
  const wasRewound = useRef(rewound)
  useEffect(() => {
    if (wasRewound.current && !rewound) say(t('guide.liveAgain'), 2500)
    wasRewound.current = rewound
  }, [rewound, say, t])

  // Rewind by touching (or dragging along) the part of the route sailed on this crossing.
  const drag = useRef({ on: false, last: 0, place: '' })
  const rewindAt = (e: PointerEvent<HTMLButtonElement>, announce: boolean) => {
    const svg = e.currentTarget.querySelector('svg')
    if (!svg || !liveShip || !zones) return
    const r = svg.getBoundingClientRect()
    const scale = MAP_VIEW.size / r.width
    const { fraction, distance } = fractionAt(MAP_VIEW.x + (e.clientX - r.left) * scale, MAP_VIEW.y + (e.clientY - r.top) * scale)
    if (distance > HIT_PX * scale) return
    const target = timeAtFraction(liveShip.history, fraction)
    if (target.kind === 'ok') {
      timeShift.rewindTo(target.at)
      drag.current.place = zones[zoneAt(fraction)].here
      if (announce) say(t('guide.rewinding', { place: drag.current.place }))
    } else if (announce && target.kind === 'ahead') {
      const { sailing } = liveShip
      const left = Math.abs(fraction - sailing.fraction) / Math.max(0.01, Math.abs((sailing.direction === 1 ? 1 : 0) - sailing.fraction))
      say(sailing.etaMin === null ? t('guide.notYetDocked') : t('guide.notYet', { min: Math.max(1, Math.round(sailing.etaMin * Math.min(1, left))) }))
    } else if (announce) {
      say(t('guide.notRecorded'))
    }
  }
  const routeHandlers = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { on: true, last: performance.now(), place: '' }
      rewindAt(e, false)
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      if (!drag.current.on || performance.now() - drag.current.last < DRAG_MS) return
      drag.current.last = performance.now()
      rewindAt(e, false)
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      drag.current.on = false
      rewindAt(e, true)
    },
    // Enter or Space (a click with no pointer): rewind ten minutes, within this crossing.
    onPress: (e: MouseEvent<HTMLButtonElement>) => {
      if (e.detail !== 0 || !liveShip || !zones) return
      const rows = liveShip.history
      const at = Math.max(Date.parse(rows[0]?.time ?? liveShip.row.time), Date.parse(liveShip.row.time) - KEY_REWIND_MS)
      timeShift.rewindTo(at)
    },
  }

  const zone = ship && zones ? zones[ship.sailing.zoneId] : undefined
  const leaving = !!run && run.phase === 'cover' && (run.kind === 'dive' || run.kind === 'reform')

  return (
    <div className={`${styles.hud} ${leaving ? styles.leaving : ''}`}>
      {ship && zone && (
        <>
          <NowCard ship={ship} zone={zone} className={styles.card} />
          <div className={styles.corner}>
            <ViewBubble />
            <Bubble size={92} bob={2.6} aria-label={t('language.label')} onClick={toggle}>
              <span className={styles.lang}>{t('language.button')}</span>
            </Bubble>
          </div>
          <div className={styles.quiz} data-tour="quiz">
            <Bubble size={140} bob={0.6} caption={t('bubbles.quiz')} onClick={() => go('/quiz')}>
              <MedalIcon />
            </Bubble>
          </div>
          <div className={styles.lab}>
            <Bubble size={140} bob={5.2} caption={t('bubbles.lab')} aria-label={t('bubbles.labLabel')} onClick={() => go('/lab')}>
              <SparkIcon />
            </Bubble>
          </div>
          <div className={styles.map}>
            <RouteMapBubble
              sailing={(liveShip ?? ship).sailing}
              place={zone.here}
              ghost={rewound ? ship.sailing.fraction : null}
              recordedFrom={liveShip ? recordedFrom(liveShip.history) : null}
              {...routeHandlers}
            />
          </div>
          {rewound && (
            <div className={styles.live}>
              <LiveBar place={zone.here} />
            </div>
          )}
          <div className={styles.dive} data-dive-bubble>
            <DiveBubble fraction={ship.sailing.fraction} onPress={() => go('/dive')} />
          </div>
        </>
      )}
    </div>
  )
}
