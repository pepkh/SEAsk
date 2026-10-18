import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import { RECORDED_DAY } from '../../api/shipFeed'
import { formatDay, formatNumber } from '../../i18n/format'
import { useLanguage } from '../../i18n/LanguageContext'
import { PROFILE_VALUE } from '../../ship/profile'
import { ROUTE } from '../../ship/sailing'
import type { TrackMeta, ZonesContent } from '../../types/content'
import type { ShipRow } from '../../types/feed'
import type { RouteProfile } from '../../types/profile'
import type { Sailing } from '../../types/sailing'
import styles from './RouteProfileCard.module.css'

const W = 572
const H = 150
const M = { left: 40, right: 10, top: 10, bottom: 26 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom
/** Zone names are drawn only where they fit (Active Pass is the narrowest one that does). */
const MIN_LABEL_PX = 55

interface Props {
  profile: RouteProfile
  track: TrackMeta
  digits: number
  row: ShipRow
  sailing: Sailing
  zones: ZonesContent
  className?: string
}

/** About four round ticks inside [min, max]. */
function ticks(min: number, max: number): number[] {
  const raw = (max - min) / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? 10 * mag
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)))
  return out
}

/**
 * The selected track reading along the route: the usual value on the recorded day (line), where the
 * ship is now (rule) and the live reading (dot). Swartz Bay is on the left, like the Seafloor slice.
 */
export function RouteProfileCard({ profile, track, digits, row, sailing, zones, className = '' }: Props) {
  const { t, lang } = useLanguage()
  const [hover, setHover] = useState<number | null>(null)
  const key = PROFILE_VALUE[track.key]
  const bins = profile.bins
  const values = bins.map((b) => (b.n > 0 ? b[key] : null))
  const live = sailing.status === 'sailing' ? row[track.key] : null
  const here = Math.min(bins.length - 1, Math.max(0, Math.floor(sailing.fraction * bins.length)))
  const usual = values[here]
  // The chart runs west to east whichever way the ship sails.
  const [west, east] = sailing.direction === 1 ? [sailing.from, sailing.to] : [sailing.to, sailing.from]

  const known = values.filter((v): v is number => v !== null)
  if (!known.length) return null
  let lo = Math.min(...known, live ?? Infinity)
  let hi = Math.max(...known, live ?? -Infinity)
  const pad = (hi - lo) * 0.08 || 1
  lo -= pad
  hi += pad

  const x = (fraction: number) => M.left + fraction * PLOT_W
  const y = (v: number) => M.top + ((hi - v) / (hi - lo)) * PLOT_H
  const bottom = M.top + PLOT_H

  // Line and area, broken where a bin has no data.
  let line = ''
  let area = ''
  let run: [number, number][] = []
  const flush = () => {
    if (run.length > 1) {
      line += `M${run.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join(' L')} `
      area += `M${run[0][0].toFixed(1)} ${bottom} L${run.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join(' L')} L${run[run.length - 1][0].toFixed(1)} ${bottom} Z `
    }
    run = []
  }
  bins.forEach((b, i) => {
    const v = values[i]
    if (v === null) flush()
    else run.push([x(b.fraction), y(v)])
  })
  flush()

  const unit = track.unit === '%' ? '%' : ` ${track.unit}`
  const fmt = (v: number | null, d = digits) => (v === null ? '—' : `${formatNumber(v, d, lang)}${unit}`)
  const zoneMean = ROUTE.zones.map((z) => {
    const inZone = bins.flatMap((b, i) => (b.zone === z.id && values[i] !== null ? [[values[i]!, b.n]] : []))
    const n = inZone.reduce((s, [, w]) => s + w, 0)
    return { zone: z, mean: n ? inZone.reduce((s, [v, w]) => s + v * w, 0) / n : null }
  })

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    setHover(Math.min(bins.length - 1, Math.max(0, Math.floor(((px - M.left) / PLOT_W) * bins.length))))
  }
  const step = (e: KeyboardEvent<SVGSVGElement>) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    setHover((h) => Math.min(bins.length - 1, Math.max(0, (h ?? here) + d * 4)))
  }
  const tip = hover === null ? null : bins[hover]

  return (
    <div className={`${styles.card} ${className}`}>
      <div className={styles.head}>
        <div className={styles.titles}>
          <span className={styles.title}>{t('journey.profile.title', { reading: track.label })}</span>
          <span className={styles.subtitle}>
            {west.name} – {east.name} · {t('journey.profile.subtitle', { date: formatDay(RECORDED_DAY, lang) })}
          </span>
        </div>
        <dl className={styles.stats}>
          {live !== null && (
            <div>
              <dt><i className={styles.keyNow} />{t('journey.profile.now')}</dt>
              <dd>{fmt(live)}</dd>
            </div>
          )}
          <div>
            <dt><i className={styles.keyUsual} />{t('journey.profile.usual')}</dt>
            <dd>{fmt(usual)}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.plot}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t('journey.profile.label', { reading: track.label.toLowerCase() })}
          tabIndex={0}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(here)}
          onBlur={() => setHover(null)}
          onKeyDown={step}
        >
          {ROUTE.zones.map((z, i) => (
            <g key={z.id}>
              {i % 2 === 1 && <rect x={x(z.from)} y={M.top} width={x(z.to) - x(z.from)} height={PLOT_H} className={styles.band} />}
              {x(z.to) - x(z.from) >= MIN_LABEL_PX && zones[z.id] && (
                <text x={(x(z.from) + x(z.to)) / 2} y={H - 8} textAnchor="middle" className={styles.zoneLabel}>
                  {zones[z.id].here}
                </text>
              )}
            </g>
          ))}
          {ticks(lo, hi).map((v) => (
            <g key={v}>
              <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} className={styles.grid} />
              <text x={M.left - 6} y={y(v) + 4} textAnchor="end" className={styles.tick}>{formatNumber(v, v % 1 ? 1 : 0, lang)}</text>
            </g>
          ))}
          <line x1={M.left} x2={W - M.right} y1={bottom} y2={bottom} className={styles.axis} />
          <path d={area} className={styles.area} />
          <path d={line} className={styles.line} />

          <line x1={x(sailing.fraction)} x2={x(sailing.fraction)} y1={M.top} y2={bottom} className={styles.here} />
          {usual !== null && <circle cx={x(sailing.fraction)} cy={y(usual)} r="4" className={styles.usualDot} />}
          {live !== null && <circle cx={x(sailing.fraction)} cy={y(live)} r="5.5" className={styles.nowDot} />}

          {tip && (
            <g pointerEvents="none">
              <line x1={x(tip.fraction)} x2={x(tip.fraction)} y1={M.top} y2={bottom} className={styles.crosshair} />
              {values[hover!] !== null && <circle cx={x(tip.fraction)} cy={y(values[hover!]!)} r="4" className={styles.usualDot} />}
            </g>
          )}
        </svg>
        {tip && (
          <div
            className={styles.tooltip}
            style={{ left: `${(x(tip.fraction) / W) * 100}%`, transform: `translateX(${tip.fraction > 0.7 ? '-100%' : tip.fraction < 0.3 ? '0' : '-50%'})` }}
          >
            <b>{fmt(values[hover!])}</b>
            <span>{zones[tip.zone]?.here ?? tip.zone} · {formatNumber(tip.km, 1, lang)} km</span>
          </div>
        )}
      </div>

      <table className={styles.srOnly}>
        <caption>{t('journey.profile.tableCaption', { reading: track.label.toLowerCase() })}</caption>
        <thead>
          <tr><th>{t('journey.profile.zone')}</th><th>{t('journey.profile.value')}</th></tr>
        </thead>
        <tbody>
          {zoneMean.map(({ zone, mean }) => (
            <tr key={zone.id}><td>{zones[zone.id]?.here ?? zone.id}</td><td>{fmt(mean)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
