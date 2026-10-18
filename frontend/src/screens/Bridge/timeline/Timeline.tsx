import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useBridgeData, usePlayhead } from '../../../bridge/BridgeProvider'
import { windSourceSampler } from '../../../bridge/field'
import type { DayData } from '../../../bridge/model'
import { usePlayheadTime } from '../../../bridge/playhead'
import { extent, valueAt, type Axis } from '../../../bridge/series'
import { fmtClock, HOUR, MINUTE } from '../../../bridge/time'
import { short } from '../../../config/sources'
import { linePath, type Scale } from '../charts/path'
import { num, t } from '../strings'
import { PlayControls } from './PlayControls'
import styles from './Timeline.module.css'

const LABEL_W = 210
const ROW_H = 21
const AXIS_H = 18
const BAND_H = 22

interface Line {
  axis: Axis
  v: Float32Array
  dashed?: boolean
}

interface Row {
  id: string
  label: string
  unit: string
  digits: number
  lines: Line[]
  /** Draw a zero line (signed values) */
  zero?: boolean
  note?: string
}

/** Wind at the ship's position every 10 minutes, blended like the rail (measured near a station, else model). */
function windAlongTrack(day: DayData): Line | null {
  const ship = day.ship
  if (!ship || (!day.weather && !day.windobs)) return null
  const axis = { t0: day.dayStart, stepMs: 10 * MINUTE, n: Math.round((day.dayEnd - day.dayStart) / (10 * MINUTE)) + 1 }
  const v = new Float32Array(axis.n).fill(NaN)
  for (let i = 0; i < axis.n; i++) {
    const time = axis.t0 + i * axis.stepMs
    const lat = valueAt(ship.axis, ship.c.lat, time)
    const lon = valueAt(ship.axis, ship.c.lon, time)
    const w = Number.isFinite(lat) ? windSourceSampler(day, time)?.(lat, lon) : null
    if (w) v[i] = Math.hypot(w.uv[0], w.uv[1])
  }
  return { axis, v }
}

function rowsOf(day: DayData): Row[] {
  const rows: Row[] = []
  const ship = day.ship
  if (ship) {
    const s = (k: keyof typeof ship.c): Line[] => [{ axis: ship.axis, v: ship.c[k] }]
    rows.push(
      { id: 'sst', label: 'Sea temp', unit: '°C', digits: 1, lines: s('sstC') },
      { id: 'sal', label: 'Salinity', unit: 'psu', digits: 1, lines: s('sal') },
      { id: 'o2', label: 'O₂ sat', unit: '%', digits: 0, lines: s('o2Sat') },
      { id: 'chl', label: 'Chlorophyll', unit: 'µg/l', digits: 1, lines: s('chl') },
      { id: 'roll', label: 'Roll', unit: '°', digits: 1, lines: s('rollDeg'), zero: true },
    )
  }
  const wind = windAlongTrack(day)
  if (wind) rows.push({ id: 'wind', label: 'Wind at ship', unit: 'kn', digits: 0, lines: [wind], note: `Measured near ${short('eccc')} stations, ${short('openMeteo')} model elsewhere (as on the map)` })
  const mb = day.tides?.stations.find((x) => x.code === '07528') ?? day.tides?.stations[0]
  if (mb && day.tides) rows.push({ id: 'tide', label: `Tide ${mb.name}`, unit: 'm', digits: 2, lines: [{ axis: day.tides.axis, v: mb.h }] })
  if (day.tides?.current) rows.push({ id: 'cur', label: 'Active Pass', unit: 'kn', digits: 1, lines: [{ axis: day.tides.axis, v: day.tides.current.signedKn }], zero: true, note: '+ flood / − ebb' })
  return rows
}

/** Live: the window shown around now (the current crossing fits in the 2 h behind). */
const LIVE_BACK = 2 * HOUR
const LIVE_AHEAD = HOUR

/** Now (ms) rounded down to the minute, kept current while `on`. */
function useMinuteClock(on: boolean): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / MINUTE) * MINUTE)
  useEffect(() => {
    if (!on) return
    const tick = () => setNow(Math.floor(Date.now() / MINUTE) * MINUTE)
    tick()
    const id = window.setInterval(tick, 5000)
    return () => window.clearInterval(id)
  }, [on])
  return now
}

interface Tick {
  t: number
  major: boolean
  label: string | null
}

/** Clock ticks for a window: for a day every hour (labelled every 2 h), for a few hours every 30 min (labelled hourly). */
function ticksOf(from: number, to: number): Tick[] {
  const short = to - from <= 6 * HOUR
  const stepMin = short ? 30 : 60
  const [h0, m0] = fmtClock(from).split(':').map(Number)
  const offset = (stepMin - ((h0 * 60 + m0) % stepMin)) % stepMin
  const out: Tick[] = []
  for (let t = Math.floor(from / MINUTE) * MINUTE + offset * MINUTE; t <= to; t += stepMin * MINUTE) {
    const [h, m] = fmtClock(t).split(':').map(Number)
    out.push(
      short
        ? { t, major: m === 0, label: m === 0 ? fmtClock(t) : null }
        : { t, major: h % 6 === 0, label: h % 2 === 0 ? String(h).padStart(2, '0') : null },
    )
  }
  return out
}

/**
 * Bottom strip: play controls, the crossings, and every reading on one time axis. Replay shows the
 * whole day; live shows a window that moves with now (2 h behind, 1 h of forecast ahead). Drag to scrub.
 */
export function Timeline({ className }: { className: string }) {
  const { day, version, mode } = useBridgeData()
  const live = mode === 'live'
  const playhead = usePlayhead()
  const plot = useRef<HTMLDivElement>(null)
  const cursor = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  const nowMin = useMinuteClock(live)

  // Layout width in design pixels (offsetWidth ignores the CSS zoom).
  useEffect(() => {
    const el = plot.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(Math.max(200, el.offsetWidth)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const from = live ? nowMin - LIVE_BACK : day.dayStart
  const to = live ? nowMin + LIVE_AHEAD : day.dayEnd
  const span = to - from
  const x = (time: number) => ((time - from) / span) * width
  const pct = (time: number) => Math.min(100, Math.max(0, ((time - from) / span) * 100))

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => rowsOf(day), [day, version])
  const height = AXIS_H + BAND_H + rows.length * ROW_H + 4

  const paths = useMemo(
    () =>
      rows.map((row, r) => {
        let lo = Infinity
        let hi = -Infinity
        for (const l of row.lines) {
          const [a, b] = extent(l.v)
          if (a < lo) lo = a
          if (b > hi) hi = b
        }
        if (row.zero && Number.isFinite(lo)) {
          const m = Math.max(Math.abs(lo), Math.abs(hi))
          lo = -m
          hi = m
        }
        const top = AXIS_H + BAND_H + r * ROW_H + 3
        const h = ROW_H - 6
        const s: Scale = {
          x: (time) => ((time - from) / span) * width,
          y: (v) => (hi > lo ? top + h - ((v - lo) / (hi - lo)) * h : top + h / 2),
        }
        return {
          lines: row.lines.map((l) => ({ d: linePath(l.axis, l.v, s, 0, width), dashed: l.dashed })),
          zeroY: row.zero ? s.y(0) : null,
          top,
        }
      }),
    [rows, width, from, span],
  )

  // The cursor moves without re-rendering the SVG.
  useEffect(() => {
    const place = () => {
      const el = cursor.current
      if (el) el.style.transform = `translateX(${Math.min(100, Math.max(0, ((playhead.get().t - from) / span) * 100))}%)`
    }
    place()
    return playhead.subscribe(place)
  }, [playhead, from, span])

  const seekAt = (clientX: number) => {
    const r = plot.current!.getBoundingClientRect()
    playhead.seek(from + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * span)
  }
  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    playhead.setPlaying(false)
    seekAt(e.clientX)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAt(e.clientX)
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 * MINUTE : MINUTE
    const now = playhead.get().t
    if (e.key === 'ArrowLeft') playhead.seek(now - step)
    else if (e.key === 'ArrowRight') playhead.seek(now + step)
    else if (e.key === 'Home') playhead.seek(from)
    else if (e.key === 'End') {
      if (live) playhead.goLive(Date.now())
      else playhead.seek(to)
    } else if (e.key === ' ') playhead.setPlaying(!playhead.get().playing)
    else return
    e.preventDefault()
  }

  const nowT = usePlayheadTime(playhead, 6, live ? 1000 : MINUTE)
  const ticks = ticksOf(from, to)
  // A crossing still under way ends now; only crossings inside the window are drawn.
  const crossings = (day.ship?.crossings ?? [])
    .map((c) => ({ ...c, end: Math.min(c.end, live ? Date.now() : day.dayEnd) }))
    .filter((c) => c.end > from && c.start < to)
  const nowX = live ? x(Date.now()) : null

  return (
    <section className={`${styles.timeline} ${className}`} aria-label={t('timeline')}>
      <PlayControls />
      <div className={styles.body}>
        <div className={styles.labels} style={{ width: LABEL_W, paddingTop: AXIS_H + BAND_H }}>
          {rows.map((row) => {
            const v = row.lines[0] ? valueAt(row.lines[0].axis, row.lines[0].v, nowT) : NaN
            return (
              <div key={row.id} className={styles.label} style={{ height: ROW_H }} title={row.note}>
                <span>{row.label}</span>
                <b>
                  {num(v, row.digits)}
                  {Number.isFinite(v) && <small>{row.unit}</small>}
                </b>
              </div>
            )
          })}
        </div>
        <div
          ref={plot}
          className={styles.plot}
          style={{ height }}
          role="slider"
          tabIndex={0}
          aria-label={t('timeline')}
          aria-valuemin={from}
          aria-valuemax={to}
          aria-valuenow={nowT}
          aria-valuetext={fmtClock(nowT)}
          onPointerDown={down}
          onPointerMove={move}
          onKeyDown={key}
        >
          {/* Lines and shapes scale with the box (so they always match the cursor); text is HTML on top. */}
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={styles.svg} style={{ height }} aria-hidden="true">
            {nowX !== null && nowX < width && <rect x={Math.max(0, nowX)} y={AXIS_H - 4} width={width - Math.max(0, nowX)} height={height - AXIS_H + 4} className={styles.future} />}
            {ticks.map((k) => (
              <line key={k.t} x1={x(k.t)} x2={x(k.t)} y1={AXIS_H - 4} y2={height} className={k.major ? styles.grid : styles.gridMinor} />
            ))}
            {crossings.map((c) => {
              const x0 = Math.max(0, x(c.start))
              const w = Math.max(2, Math.min(width, x(c.end)) - x0)
              return (
                <g key={c.id} className={styles.band} data-dir={c.direction}>
                  <rect x={x0} y={AXIS_H + 2} width={w} height={BAND_H - 6} rx={3} />
                  <rect x={x0} y={AXIS_H + BAND_H} width={w} height={height - AXIS_H - BAND_H} className={styles.underway} />
                </g>
              )
            })}
            {paths.map((p, r) => (
              <g key={rows[r].id}>
                {p.zeroY !== null && <line x1={0} x2={width} y1={p.zeroY} y2={p.zeroY} className={styles.zero} />}
                {p.lines.map((l, k) => (
                  <path key={k} d={l.d} className={l.dashed ? styles.dashed : styles.spark} />
                ))}
              </g>
            ))}
          </svg>
          {ticks.map((k) =>
            k.label && k.t < to - 20 * MINUTE ? (
              <span key={k.t} className={styles.hour} style={{ left: `${pct(k.t)}%` }}>
                {k.label}
              </span>
            ) : null,
          )}
          {nowX !== null && nowX < width && (
            <span className={styles.forecast}>forecast</span>
          )}
          {crossings.map((c) => (
            <button
              key={c.id}
              type="button"
              className={styles.bandLabel}
              data-dir={c.direction}
              style={{ left: `${pct(c.start)}%`, width: `${pct(c.end) - pct(c.start)}%`, top: AXIS_H + 2, height: BAND_H - 6 }}
              onPointerDown={(e) => {
                e.stopPropagation()
                playhead.setPlaying(false)
                playhead.seek(c.start)
              }}
              aria-label={`Crossing ${c.id}, departed ${fmtClock(c.start)}`}
            >
              {c.id} {c.direction === 'swb_to_tsa' ? 'SWB→TSA' : 'TSA→SWB'}
            </button>
          ))}
          <div ref={cursor} className={styles.cursor}>
            <i />
          </div>
        </div>
      </div>
    </section>
  )
}
