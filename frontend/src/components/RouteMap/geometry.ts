import { anchoredLerp } from '../../ship/geo'
import { ROUTE } from '../../ship/sailing'
import type { Direction } from '../../types/sailing'

/* Route map drawing from the mockups (viewBox 1360 × 968 on Kids, 1320 × 968 on Grown-ups). */

export const ISLAND_PATHS = [
  'M72 971 L510 971 L475 886 L459 821 L436 790 L383 773 L302 766 L256 817 L164 869 L49 903 Z',
  'M349 698 L452 638 L441 578 L383 518 L256 424 L95 364 L-43 424 L-20 526 L49 629 L164 681 Z',
  'M429 561 L452 530 L521 518 L528 547 L475 564 Z',
  'M671 715 L620 672 L630 612 L671 586 L758 595 L851 638 L837 689 L775 718 Z',
  'M643 538 L620 504 L659 492 L717 485 L775 489 L809 509 L786 533 L717 547 Z',
  'M590 456 L659 461 L740 455 L786 439 L729 398 L602 338 L441 287 L302 244 L268 278 L383 355 L510 424 Z',
  'M901 663 L924 603 L1086 586 L1247 603 L1270 646 L1132 677 Z',
  'M855 47 L993 133 L1132 201 L1155 244 L1166 283 L1247 307 L1408 295 L1592 253 L1592 47 Z',
]

type Pt = [number, number]

/** Route line from Swartz Bay to Tsawwassen. Index 8 is the ship position in the mockups (Active Pass). */
const ROUTE_SVG: Pt[] = [
  [416, 786], [445, 766], [475, 723], [521, 663], [567, 595], [579, 535], [590, 501], [648, 479], [706, 472],
  [758, 467], [821, 441], [901, 390], [970, 330], [1021, 278], [1059, 242],
]
const ACTIVE_PASS_INDEX = 8

const cumulative = ROUTE_SVG.reduce<number[]>(
  (acc, p, i) => [...acc, i ? acc[i - 1] + Math.hypot(p[0] - ROUTE_SVG[i - 1][0], p[1] - ROUTE_SVG[i - 1][1]) : 0],
  [],
)
const total = cumulative[cumulative.length - 1]

export const SWARTZ_BAY_PT = ROUTE_SVG[0]
export const TSAWWASSEN_PT = ROUTE_SVG[ROUTE_SVG.length - 1]

function pointAt(len: number): Pt {
  const i = Math.max(0, Math.min(ROUTE_SVG.length - 2, cumulative.findIndex((c) => c >= len) - 1))
  const span = cumulative[i + 1] - cumulative[i]
  const t = span ? Math.min(1, Math.max(0, (len - cumulative[i]) / span)) : 0
  const [a, b] = [ROUTE_SVG[i], ROUTE_SVG[i + 1]]
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

const toPath = (pts: Pt[]) => (pts.length < 2 ? '' : 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L'))

export interface SvgRoute {
  /** Path from the departure terminal to the ship */
  travelled: string
  /** Path from the ship to the arrival terminal */
  remaining: string
  ship: Pt
  /** Departure terminal point (start of the travelled path) */
  from: Pt
}

/**
 * Split the drawn route at the ship. The route fraction maps to the drawing so that
 * Active Pass on the real route is at the mockup ship position.
 */
export function svgRoute(fraction: number, direction: Direction): SvgRoute {
  const len = anchoredLerp(fraction, [[0, 0], [ROUTE.activePassAt, cumulative[ACTIVE_PASS_INDEX]], [1, total]])
  const ship = pointAt(len)
  const before = [...ROUTE_SVG.filter((_, i) => cumulative[i] < len), ship]
  const after = [ship, ...ROUTE_SVG.filter((_, i) => cumulative[i] > len)]
  return direction === 1
    ? { travelled: toPath(before), remaining: toPath(after), ship, from: SWARTZ_BAY_PT }
    : { travelled: toPath(after), remaining: toPath(before), ship, from: TSAWWASSEN_PT }
}
