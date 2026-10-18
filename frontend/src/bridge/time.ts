/* Times on the bridge: epoch ms everywhere, shown as a 24-hour clock in the route's time zone. */

export const TZ = 'America/Vancouver'
export const MINUTE = 60_000
export const HOUR = 3_600_000

const clock = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const clockSec = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
const dayName = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const zoneName = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, timeZoneName: 'short' })
const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** "14:05" */
export const fmtClock = (ms: number) => clock.format(ms)
/** "14:05:09" */
export const fmtClockSec = (ms: number) => clockSec.format(ms)
/** "Mon, Aug 17, 2026" */
export const fmtDay = (ms: number) => dayName.format(ms)
/** "PDT" */
export const zoneAbbr = (ms: number) => zoneName.formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value ?? ''
/** Local date "2026-08-17" of an instant. */
export const localDate = (ms: number) => dateParts.format(ms)

/** "1 h 12 min", "12 min", "45 s" */
export function fmtDuration(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000)
  if (s < 60) return `${s} s`
  const min = Math.round(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
}

export const parseIso = (iso: string) => Date.parse(iso)

/** Epoch ms of local midnight that starts `date` ("2026-08-17"), plus `addDays`. Handles PDT and PST. */
export function localMidnight(date: string, addDays = 0): number {
  const [y, m, d] = date.split('-').map(Number)
  for (const offsetH of [7, 8]) {
    const t = Date.UTC(y, m - 1, d + addDays, offsetH)
    if (fmtClock(t) === '00:00') return t
  }
  return Date.UTC(y, m - 1, d + addDays, 8)
}
