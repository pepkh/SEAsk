import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { uiScaleFor } from '../../hooks/useUiScale'
import { useLanguage } from '../../i18n/LanguageContext'
import { diveCenter } from '../WaterTransition/diveBubble'
import { DIVE_JUMP_AT, DIVE_SPLASH_AT, levelOf, SURFACE_HOP_AT, TIMING } from '../WaterTransition/levels'
import { useTransition, type TransitionRun } from '../WaterTransition/TransitionContext'
import { AskGuide } from './AskGuide'
import type { DiverMotion } from './DiverModel'
import { DiverSprite } from './DiverSprite'
import styles from './Guide.module.css'
import { useGuide, type GuideSpot, type TourStep } from './GuideContext'

const DiverCanvas = lazy(() => import('./DiverModel'))

/** Canvas box at design size (px); each spot shows the diver at its own height by scaling the box. */
const BOX_W = 240
const BOX_H = 320
const HEIGHT: Record<GuideSpot, number> = { welcome: 300, hub: 200, 'corner-right': 230, 'corner-left': 230, header: 124, hidden: 190 }

interface Pose {
  /** Feet position (px from the window's top left) */
  x: number
  y: number
  /** Diver height (px) */
  h: number
  /** Tilt (deg): head-first when diving */
  rot: number
  opacity: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k


/** A jump from `a` to `b`: straight across, lifted by `lift` px in the middle. */
function arc(a: { x: number; y: number }, b: { x: number; y: number }, k: number, lift: number) {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) - Math.sin(k * Math.PI) * lift }
}

/** Home on the ferry screen: standing in the Now card's diver spot (feet on its floor, as tall as the spot). */
function homePose(ui: number): Pose {
  const r = document.querySelector('[data-guide-home]')?.getBoundingClientRect()
  if (r && r.height > 0) return { x: r.left + r.width / 2, y: r.bottom - 6 * ui, h: r.height * 0.92, rot: 0, opacity: 1 }
  return { x: 600 * ui, y: 340 * ui, h: HEIGHT.hub * ui, rot: 0, opacity: 1 }
}

/** A jump's height: higher for longer jumps (the leap from the card to the Dive bubble crosses the screen). */
const liftFor = (a: { x: number; y: number }, b: { x: number; y: number }, ui: number) =>
  Math.max(110 * ui, Math.hypot(b.x - a.x, b.y - a.y) * 0.22)

/** On phones (no UI scaling) the diver would be huge next to everything else. */
const PHONE_SIZE = 0.6

function spotPose(spot: GuideSpot, w: number, h: number, ui: number): Pose {
  const size = HEIGHT[spot] * ui * (w <= 900 ? PHONE_SIZE : 1)
  switch (spot) {
    case 'welcome':
      return w <= 900 ? { x: w * 0.82, y: h * 0.96, h: 200, rot: 0, opacity: 1 } : { x: w / 2 + 480 * ui, y: h / 2 + 330 * ui, h: size, rot: 0, opacity: 1 }
    case 'hub':
      return homePose(ui)
    case 'corner-right':
      return { x: w - 150 * ui, y: h - 20 * ui, h: size, rot: 0, opacity: 1 }
    case 'corner-left':
      return { x: 150 * ui, y: h - 20 * ui, h: size, rot: 0, opacity: 1 }
    case 'header':
      // In an inner screen's header, left of the language button (clear of everything you can touch)
      return { x: w - 250 * ui, y: 146 * ui, h: size, rot: 0, opacity: 1 }
    case 'hidden':
      return { x: w - 150 * ui, y: h + 40 * ui, h: size, rot: 0, opacity: 0 }
  }
}

/** Next to a tour target: on its right if there is room, else on its left. */
function tourPose(target: string, w: number, h: number, ui: number): Pose | null {
  const el = document.querySelector(`[data-tour="${target}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  const size = HEIGHT.hub * ui
  const right = r.right + 110 * ui < w
  return { x: right ? r.right + 80 * ui : r.left - 80 * ui, y: Math.min(h - 10, r.bottom), h: size, rot: 0, opacity: 1 }
}

/** The scripted part of a transition (leap from the card into the Dive bubble, swim up, pop out, leap back). */
function scriptedPose(run: TransitionRun | null, now: number, w: number, h: number, ui: number): Pose | null {
  if (!run || run.reduced) return null
  const e = now - run.startedAt
  if (run.kind === 'pop' && run.phase === 'reveal') {
    const k = easeInOut(clamp01(e / TIMING.pop.reveal))
    const from = spotPose('welcome', w, h, ui)
    const to = homePose(ui)
    return { ...arc(from, to, k, liftFor(from, to, ui)), h: lerp(from.h, to.h, k), rot: 0, opacity: 1 }
  }
  if (run.kind === 'dive' && run.phase === 'cover') {
    const home = homePose(ui)
    const water = diveCenter(w, h, ui)
    if (e < DIVE_JUMP_AT) return home
    if (e < DIVE_SPLASH_AT) {
      // Out of the card and across the screen into the water bubble, turning head-first on the way down
      const k = (e - DIVE_JUMP_AT) / (DIVE_SPLASH_AT - DIVE_JUMP_AT)
      return { ...arc(home, water, easeInOut(k), liftFor(home, water, ui)), h: home.h * (1 - 0.2 * k), rot: 175 * k * k, opacity: 1 }
    }
    // Under the water: keep sinking while the water rises out of the bubble over the screen.
    const k = clamp01((e - DIVE_SPLASH_AT) / (TIMING.dive.cover - DIVE_SPLASH_AT))
    return { x: water.x, y: water.y + 150 * ui * (1 - (1 - k) ** 2), h: home.h * (0.8 - 0.1 * k), rot: 175 - 15 * k, opacity: 1 }
  }
  if (run.kind === 'surface' && run.phase === 'reveal') {
    const water = diveCenter(w, h, ui)
    const home = homePose(ui)
    if (e < SURFACE_HOP_AT) {
      // Pops up out of the Dive bubble…
      const k = e / SURFACE_HOP_AT
      return { x: water.x, y: water.y + (1 - k) * 90 * ui, h: home.h * 0.8, rot: 0, opacity: 1 }
    }
    // …and leaps back into the card.
    const k = easeInOut(clamp01((e - SURFACE_HOP_AT) / (TIMING.surface.reveal - SURFACE_HOP_AT)))
    return { ...arc(water, home, k, liftFor(water, home, ui)), h: home.h * (0.8 + 0.2 * k), rot: 0, opacity: 1 }
  }
  return null
}

/** If the 3D model can't load, the flat drawing stays. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/**
 * The diver mascot. On the ferry screen it stands in the Now card, on the welcome screen beside the welcome
 * bubble, and on inner screens in a corner or the header; it leaps into the Dive bubble and back with the dive and surface
 * transitions. Tapping it on the ferry starts a short tour.
 */
export function Guide() {
  const { t } = useLanguage()
  const { spot, line, reaction, tour, startTour, nextTour, endTour, react, say, hush } = useGuide()
  const { run } = useTransition()
  const { pathname } = useLocation()
  const reduced = useReducedMotion()
  const diver = useRef<HTMLDivElement>(null)
  const speech = useRef<HTMLDivElement>(null)
  const motion = useRef<DiverMotion>({ reaction: null, look: 0, reduced })
  const live = useRef({ spot, run, tourTarget: null as string | null, reduced })
  useEffect(() => {
    live.current = { spot, run, tourTarget: tour ? tour.steps[tour.step].target : null, reduced }
    motion.current.reduced = reduced
  })
  const underwater = levelOf(pathname) === 'below'

  useEffect(() => {
    if (reaction) motion.current.reaction = { kind: reaction.kind, at: performance.now() }
  }, [reaction])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let pose: Pose | null = null
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const w = window.innerWidth
      const h = window.innerHeight
      const ui = uiScaleFor(w, h)
      const { spot, run, tourTarget, reduced } = live.current

      let goal = (tourTarget && tourPose(tourTarget, w, h, ui)) || spotPose(spot, w, h, ui)
      if (run && !run.reduced && run.kind === 'reform' && run.phase === 'cover') goal = spotPose('welcome', w, h, ui)
      if (run && !run.reduced && run.kind === 'surface' && run.phase === 'cover' && pose) goal = { ...goal, x: pose.x, y: -0.3 * h }
      const script = scriptedPose(run, now, w, h, ui)

      if (script || !pose || reduced) pose = { ...(script ?? goal) }
      else {
        // Glide toward the goal
        const k = 1 - Math.exp(-dt * 5)
        pose = {
          x: lerp(pose.x, goal.x, k),
          y: lerp(pose.y, goal.y, k),
          h: lerp(pose.h, goal.h, k),
          rot: lerp(pose.rot, goal.rot, k),
          opacity: lerp(pose.opacity, goal.opacity, k),
        }
      }

      const boxW = BOX_W * ui
      const boxH = BOX_H * ui
      const s = pose.h / (boxH * 0.88)
      if (diver.current) {
        diver.current.style.width = `${boxW}px`
        diver.current.style.height = `${boxH}px`
        diver.current.style.opacity = pose.opacity.toFixed(3)
        diver.current.style.transform = `translate3d(${pose.x - boxW / 2}px, ${pose.y - boxH}px, 0) rotate(${pose.rot.toFixed(1)}deg) scale(${s.toFixed(3)})`
      }
      if (speech.current) {
        const left = pose.x > w * 0.5
        // Above the head, or under the feet when the diver is near the top of the screen
        const below = pose.y - pose.h < 140 * ui
        speech.current.dataset.side = left ? 'left' : 'right'
        speech.current.dataset.vertical = below ? 'below' : 'above'
        speech.current.style.setProperty('--room', `${Math.max(160, (left ? pose.x : w - pose.x) - 20)}px`)
        speech.current.style.transform = `translate3d(${pose.x + (left ? -pose.h * 0.25 : pose.h * 0.25)}px, ${below ? pose.y + 10 * ui : pose.y - pose.h * 1.02}px, 0)`
        speech.current.style.opacity = (pose.opacity > 0.5 && pose.rot < 20 ? 1 : 0).toString()
      }
      motion.current.look = Math.max(-1, Math.min(1, (w / 2 - pose.x) / (w / 2)))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Tapping the diver opens its questions (and, on the ferry screen, the tour).
  const [asking, setAsking] = useState(false)
  const [askedOn, setAskedOn] = useState(pathname)
  if (askedOn !== pathname) {
    setAskedOn(pathname)
    setAsking(false)
  }

  const tourOf = (): TourStep[] => [
    { target: 'now-card', text: t('guide.tour.now') },
    { target: 'route-map', text: t('guide.tour.map') },
    { target: 'dive', text: t('guide.tour.dive') },
    { target: 'quiz', text: t('guide.tour.quiz') },
  ]

  const onTap = () => {
    if (run || tour) return
    react('happy')
    hush()
    setAsking(!asking)
  }

  const sprite = <DiverSprite className={styles.sprite} />
  return (
    <>
      <div ref={diver} className={`${styles.diver} ${underwater ? styles.underwater : ''}`} data-spot={spot}>
        <div className={styles.art} aria-hidden="true">
          <ModelBoundary fallback={sprite}>
            <Suspense fallback={sprite}>
              <DiverCanvas motion={motion} />
            </Suspense>
          </ModelBoundary>
        </div>
        <button type="button" className={styles.hit} aria-label={t('guide.label', { name: t('guide.name') })} onClick={onTap} disabled={spot === 'hidden'} />
      </div>
      <div ref={speech} className={styles.speech} aria-live="polite">
        {asking && !line && (
          <AskGuide
            onAnswer={(text) => {
              setAsking(false)
              react('happy')
              say(text, 10_000)
            }}
            onTour={
              spot === 'hub'
                ? () => {
                    setAsking(false)
                    startTour(tourOf())
                  }
                : undefined
            }
            onClose={() => setAsking(false)}
          />
        )}
        {line && (
          <div key={line.id} className={styles.say}>
            <span>{line.text}</span>
            {tour && (
              <span className={styles.tourButtons}>
                <button type="button" className={styles.next} onClick={nextTour}>
                  {t(tour.step + 1 < tour.steps.length ? 'guide.next' : 'guide.done')}
                </button>
                <button type="button" className={styles.skip} onClick={endTour}>
                  {t('guide.skip')}
                </button>
                <small className={styles.step}>
                  {tour.step + 1} / {tour.steps.length}
                </small>
              </span>
            )}
          </div>
        )}
      </div>
    </>
  )
}
