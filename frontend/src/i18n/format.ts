import type { Lang } from './LanguageContext'

const LOCALES: Record<Lang, string> = { en: 'en-US', fr: 'fr-CA' }
const numberFormats = new Map<string, Intl.NumberFormat>()

/** Number with a fixed count of decimals. Shows "—" when there is no value. */
export function formatNumber(value: number | null | undefined, digits: number, lang: Lang): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const key = `${lang}:${digits}`
  let format = numberFormats.get(key)
  if (!format) {
    // No thousands separator: the mockups show "1484.7", not "1,484.7".
    format = new Intl.NumberFormat(LOCALES[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })
    numberFormats.set(key, format)
  }
  return format.format(value)
}

/** Clock time, for example "2:41 PM" (EN) or "14 h 41" (FR). */
export function formatTime(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALES[lang], { hour: 'numeric', minute: '2-digit' }).format(date)
}

/** Hour only, for chart axes: "6 AM" (EN) or "6 h" (FR). */
export function formatHour(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALES[lang], { hour: 'numeric' }).format(date)
}

/** Clock time split into the main part and the AM/PM part (empty in FR). */
export function timeParts(date: Date, lang: Lang): { main: string; period: string } {
  const parts = new Intl.DateTimeFormat(LOCALES[lang], { hour: 'numeric', minute: '2-digit' }).formatToParts(date)
  const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? ''
  const main = parts
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim()
  return { main, period }
}

/** Today at a local "HH:MM" time. */
export function todayAt(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

/** Minutes since local midnight for "HH:MM". */
export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** "48.868° N" / "123.310° W" (decimal comma in FR). */
export function formatLatLon(value: number, axis: 'lat' | 'lon', lang: Lang, digits = 3): string {
  const hemisphere = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : lang === 'fr' ? 'O' : 'W'
  return `${formatNumber(Math.abs(value), digits, lang)}° ${hemisphere}`
}

/** Course as three digits, for example "072". */
export const formatCourse = (deg: number) => String(Math.round(deg) % 360).padStart(3, '0')

/** Compass point (8 points) for a bearing. `points` is the i18n list, for example "N,NE,E,SE,S,SW,W,NW". */
export function compassPoint(deg: number, points: string): string {
  return points.split(',')[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}
