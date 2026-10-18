/* Pressure tendency over three hours, in the WMO words used in marine forecasts. */

export type BaroClass = 'steady' | 'slowly' | 'normal' | 'quickly' | 'veryRapidly'

export interface BaroTendency {
  /** hPa over 3 h (now minus then) */
  delta: number
  rising: boolean
  label: string
}

/** Tendency from the pressure now and three hours ago (hPa). */
export function tendency(now: number, threeHoursAgo: number): BaroTendency | null {
  if (!Number.isFinite(now) || !Number.isFinite(threeHoursAgo)) return null
  const delta = now - threeHoursAgo
  const size = Math.abs(delta)
  const rising = delta > 0
  const word = rising ? 'rising' : 'falling'
  let label: string
  if (size < 0.1) label = 'steady'
  else if (size <= 1.5) label = `${word} slowly`
  else if (size <= 3.5) label = word
  else if (size <= 6) label = `${word} quickly`
  else label = `${word} very rapidly`
  return { delta, rising, label }
}
