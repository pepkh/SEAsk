import { useState, type PointerEvent } from 'react'
import { FOULING, type FoulingProfile, type Hotspot } from '../../../bridge/derive/fouling'
import { ROUTE, zoneAt } from '../../../ship/sailing'
import { num, ZONE_NAMES } from '../strings'
import styles from './charts.module.css'

const W = 360
const H = 112
const LEFT = 22
const RIGHT = 4
const TOP = 26
const BOTTOM = 18

const ZONE_ABBR: Record<string, string> = {
  'swartz-bay': 'SB',
  'swanson-channel': 'Swanson',
  'active-pass': 'AP',
  'strait-of-georgia': 'Strait',
  tsawwassen: 'TSA',
}

/** Runs of consecutive bins where `keep(b)` holds: [first, last] bin. */
function runs(n: number, keep: (b: number) => boolean): [number, number][] {
  const out: [number, number][] = []
  for (let b = 0; b < n; b++) {
    if (!keep(b)) continue
    if (out.length && out[out.length - 1][1] === b - 1) out[out.length - 1][1] = b
    else out.push([b, b])
  }
  return out
}

/**
 * The biofouling index along the route, drawn the way the ship goes (left: where it came from): score
 * line, a band of ± half the scenario spread, the hotspot level, the hotspots, hatched stretches
 * without an estimate, and the ship. Touch or hover for the value at a distance.
 */
export function FoulingStrip({ profile, hotspots, frac, east }: { profile: FoulingProfile; hotspots: Hotspot[]; frac: number; east: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const n = profile.frac.length
  const plotW = W - LEFT - RIGHT
  const x = (f: number) => LEFT + (east ? f : 1 - f) * plotW
  const y = (v: number) => TOP + (1 - v / 100) * (H - TOP - BOTTOM)
  const binX = (b: number) => x(profile.frac[b])
  const finite = (b: number) => Number.isFinite(profile.score[b])

  const scored = runs(n, finite)
  const line = scored.map(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => `${i ? 'L' : 'M'}${binX(a + i).toFixed(1)} ${y(profile.score[a + i]).toFixed(1)}`).join('')).join('')
  const band = scored
    .map(([a, b]) => {
      const up = []
      const down = []
      for (let k = a; k <= b; k++) {
        const half = Number.isFinite(profile.spread[k]) ? profile.spread[k] / 2 : 0
        up.push(`${binX(k).toFixed(1)} ${y(Math.min(100, profile.score[k] + half)).toFixed(1)}`)
        down.push(`${binX(k).toFixed(1)} ${y(Math.max(0, profile.score[k] - half)).toFixed(1)}`)
      }
      return `M${up.join('L')}L${down.reverse().join('L')}Z`
    })
    .join('')
  // Without an estimate: the terminals (outside the training extent) and Active Pass (land at 3 km).
  const gaps = runs(n, (b) => !finite(b))
  const half = plotW / n / 2
  const span = (from: number, to: number) => {
    const a = x(from)
    const b = x(to)
    return { x: Math.min(a, b), width: Math.abs(b - a) }
  }

  const shipX = Number.isFinite(frac) ? x(frac) : NaN
  const shipBin = Number.isFinite(frac) ? Math.min(n - 1, Math.max(0, Math.floor(frac * n))) : -1

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const f = Math.min(1, Math.max(0, (px - LEFT) / plotW))
    setHover(Math.min(n - 1, Math.floor((east ? f : 1 - f) * n)))
  }
  const readout = (b: number) => {
    const f = profile.frac[b]
    const nm = (east ? f : 1 - f) * profile.lengthNm
    const place = `${num(nm, 1)} nm from ${east ? 'SB' : 'TSA'} · ${ZONE_NAMES[zoneAt(f)] ?? zoneAt(f)}`
    return finite(b) ? `${place} · ${Math.round(profile.score[b])} (spread ${Math.round(profile.spread[b])})` : `${place} · no estimate`
  }

  return (
    <figure className={styles.strip}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Biofouling index along the route${hotspots.length ? `, hotspots ${hotspots.map((h) => `${h.id} peak ${Math.round(h.peak)}`).join(', ')}` : ''}`}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <pattern id="fouling-strip-hatch" width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={5} className={styles.hatchLine} />
          </pattern>
        </defs>
        {gaps.map(([a, b]) => {
          const s = span(profile.frac[a] - half / plotW, profile.frac[b] + half / plotW)
          return <rect key={a} x={s.x} y={y(100)} width={s.width} height={y(0) - y(100)} fill="url(#fouling-strip-hatch)" />
        })}
        {hotspots.map((h) => {
          const s = span(h.from, h.to)
          return (
            <g key={h.id}>
              <rect x={s.x} y={y(100)} width={s.width} height={y(0) - y(100)} className={styles.hotSpan} />
              <text x={s.x + s.width / 2} y={y(100) - 4} textAnchor="middle" className={styles.hotLabel}>
                {h.id}
              </text>
            </g>
          )
        })}
        <line x1={LEFT} x2={W - RIGHT} y1={y(0)} y2={y(0)} className={styles.zero} />
        <line x1={LEFT} x2={W - RIGHT} y1={y(FOULING.elevated)} y2={y(FOULING.elevated)} className={styles.level} />
        {[0, FOULING.elevated, 100].map((v) => (
          <text key={v} x={LEFT - 4} y={y(v) + 3} textAnchor="end" className={styles.tick}>
            {v}
          </text>
        ))}
        <path d={band} className={styles.spreadBand} />
        <path d={line} className={styles.foulingLine} />
        {ROUTE.zones.map((z) => (
          <g key={z.id}>
            {z.from > 0 && <line x1={x(z.from)} x2={x(z.from)} y1={y(0)} y2={y(0) + 4} className={styles.zero} />}
            <text x={x((z.from + z.to) / 2)} y={H - 4} textAnchor="middle" className={styles.tick}>
              {ZONE_ABBR[z.id] ?? z.id}
            </text>
          </g>
        ))}
        {Number.isFinite(shipX) && (
          <>
            <line x1={shipX} x2={shipX} y1={y(100)} y2={y(0)} className={styles.now} />
            {shipBin >= 0 && finite(shipBin) && <circle cx={shipX} cy={y(profile.score[shipBin])} r={4} className={styles.foulingDot} />}
          </>
        )}
        {hover !== null && <line x1={binX(hover)} x2={binX(hover)} y1={y(100)} y2={y(0)} className={styles.cursor} />}
        <text x={W - RIGHT} y={11} textAnchor="end" className={styles.readout}>
          {hover !== null ? readout(hover) : shipBin >= 0 ? readout(shipBin) : `${num(profile.lengthNm, 1)} nm route`}
        </text>
      </svg>
    </figure>
  )
}
