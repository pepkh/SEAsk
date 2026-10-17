/**
 * Where each screen is: the welcome screen (no session), above the water (on the ferry) or below it.
 * Crossing from one level to another always plays the same animation, so the kiosk feels like one place.
 */
export type Level = 'welcome' | 'above' | 'below'

export const HUB_PATH = '/ferry'

export function levelOf(path: string): Level {
  if (path === '/' || path === '') return 'welcome'
  if (path.startsWith('/dive')) return 'below'
  return 'above'
}

/** pop: welcome → in; reform: back to welcome; dive / surface: across the waterline; morph: same level. */
export type TransitionKind = 'pop' | 'reform' | 'dive' | 'surface' | 'morph'

export function kindOf(from: string, to: string): TransitionKind {
  const a = levelOf(from)
  const b = levelOf(to)
  if (a === 'welcome') return 'pop'
  if (b === 'welcome') return 'reform'
  if (a === 'above' && b === 'below') return 'dive'
  if (a === 'below' && b === 'above') return 'surface'
  return 'morph'
}

/**
 * Phase lengths (ms). "cover" plays before the route changes, "reveal" after. They match the --t-* tokens:
 * pop 0.38 + 0.76 s, dive 1.5 + 0.55 s, surface 0.7 + 1 s.
 */
export const TIMING: Record<Exclude<TransitionKind, 'morph'>, { cover: number; reveal: number }> = {
  pop: { cover: 380, reveal: 760 },
  reform: { cover: 900, reveal: 220 },
  dive: { cover: 1500, reveal: 550 },
  surface: { cover: 700, reveal: 1000 },
}

/** Within the dive cover: the diver leaps at JUMP_AT, lands in the bubble (splash) at SPLASH_AT, the water covers by the end. */
export const DIVE_JUMP_AT = 200
export const DIVE_SPLASH_AT = 950
/** Within the surface reveal: the diver pops out of the Dive bubble, then leaps back into the card. */
export const SURFACE_HOP_AT = 300

/** With reduced motion every transition is a short fade. */
export const REDUCED = { cover: 150, reveal: 150 }

/** The pop waits at most this long for the 3D world's first frame (then it goes anyway). */
export const WORLD_WAIT_MS = 1500
