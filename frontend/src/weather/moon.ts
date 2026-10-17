export const MOON_PHASES = [
  'new',
  'waxingCrescent',
  'firstQuarter',
  'waxingGibbous',
  'full',
  'waningGibbous',
  'lastQuarter',
  'waningCrescent',
] as const
export type MoonPhase = (typeof MOON_PHASES)[number]

const SYNODIC_MONTH_DAYS = 29.530588853
/** A new moon: 2000-01-06 18:14 UTC */
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)

/** Moon phase on a date, from the average length of the lunar month (good to about a day). */
export function moonPhase(date: Date): MoonPhase {
  const age = (((date.getTime() - NEW_MOON_MS) / 86_400_000) % SYNODIC_MONTH_DAYS + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS
  return MOON_PHASES[Math.round((age / SYNODIC_MONTH_DAYS) * 8) % 8]
}
