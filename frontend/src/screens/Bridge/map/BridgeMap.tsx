import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useBridgeData, useBridgeUi, usePlayhead, useSnapshot, type FieldLayer } from '../../../bridge/BridgeProvider'
import { currentSampler, windSourceSampler } from '../../../bridge/field'
import { buildGrid, drawArrows, drawField, FIELD_SCALE, Particles, type VectorGrid } from '../../../bridge/map/flow'
import type { Area } from '../../../bridge/map/mercator'
import { DirtyFlags, drawTrack, drawVessels, type Hit } from '../../../bridge/map/render'
import { drawTiles, TileCache } from '../../../bridge/map/tiles'
import { useMapView } from '../../../bridge/map/useMapView'
import type { DayData } from '../../../bridge/model'
import { paletteFor } from '../../../bridge/palette'
import { OCEAN_AREA, TILE_LAYERS } from '../../../config/tiles'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import styles from './BridgeMap.module.css'
import { MapLegend } from './MapLegend'
import { MapOverlay } from './MapOverlay'
import { VesselCallout } from './VesselCallout'

/** What the map shows at first: the route with the Strait around it. */
const MAP_AREA: Area = { west: -123.6, south: 48.63, east: -122.98, north: 49.12 }

/** Field sampler at time `t`: (lat, lon) → [east, north] in the field's unit, or null outside it. */
function sampler(day: DayData, layer: FieldLayer, t: number): ((lat: number, lon: number) => [number, number] | null) | null {
  if (layer === 'currents') {
    // Radar where it measured, model currents everywhere else (field.ts currentSampler).
    const s = currentSampler(day, t)
    return s ? (lat, lon) => s(lat, lon)?.uv ?? null : null
  }
  if (layer === 'wind') {
    // Measured near the Environment Canada stations, the model everywhere else (field.ts windSourceSampler).
    const s = windSourceSampler(day, t)
    return s ? (lat, lon) => s(lat, lon)?.uv ?? null : null
  }
  return null
}

/**
 * The bridge map: offline tiles, a colour field with drifting particles (currents or wind), the own
 * track coloured by a reading, and every vessel at the playhead. One animation loop draws the canvases;
 * the SVG overlay (route, stations, scale) follows the view.
 */
export function BridgeMap({ className }: { className: string }) {
  const { day, version } = useBridgeData()
  const ui = useBridgeUi()
  const playhead = usePlayhead()
  const snapshot = useSnapshot()
  const reduced = useReducedMotion()

  const box = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const fieldRef = useRef<HTMLCanvasElement>(null)
  const flowRef = useRef<HTMLCanvasElement>(null)
  const trackRef = useRef<HTMLCanvasElement>(null)
  const topRef = useRef<HTMLCanvasElement>(null)
  const scratch = useMemo(() => document.createElement('canvas'), [])
  const particles = useMemo(() => new Particles(), [])
  const dirty = useMemo(() => new DirtyFlags(), [])
  const hits = useRef<Hit[]>([])
  const [follow, setFollow] = useState(false)

  const cache = useMemo(() => new TileCache(() => dirty.mark('base')), [dirty])
  useEffect(() => () => cache.dispose(), [cache])

  const onTap = useCallback(
    (x: number, y: number) => {
      let best: Hit | null = null
      let bestD = 28
      for (const h of hits.current) {
        const d = Math.hypot(h.x - x, h.y - y)
        if (d < bestD) {
          best = h
          bestD = d
        }
      }
      ui.setSelected(best?.kind === 'vessel' ? (best.mmsi === ui.selected ? null : best.mmsi) : null)
    },
    [ui],
  )
  const onChange = useCallback(() => dirty.mark('base', 'field', 'size', 'track', 'top'), [dirty])
  const { view, viewRef, fit, fitRegion, zoomBy, centreOn, markMoved } = useMapView(box, { area: MAP_AREA, region: OCEAN_AREA, onTap, onChange })

  // Everything the frame loop reads, kept current without restarting the loop.
  const live = useRef({ day, ui, reduced, snapshot })
  useLayoutEffect(() => {
    live.current = { day, ui, reduced, snapshot }
  })

  // A new dataset or a layer change redraws the field.
  useEffect(() => dirty.mark('field', 'track', 'top'), [dirty, version, ui.layer, ui.night])
  useEffect(() => dirty.mark('base'), [dirty, ui.basemap, ui.night])
  useEffect(() => dirty.mark('track'), [dirty, ui.trackKey])
  useEffect(() => dirty.mark('top'), [dirty, ui.selected, snapshot.targets])

  // Follow the ship.
  useEffect(() => {
    if (follow && snapshot.ship) centreOn(snapshot.ship.lat, snapshot.ship.lon)
  }, [follow, snapshot.ship, centreOn])

  // The frame loop.
  useEffect(() => {
    let raf = 0
    let frameNo = 0
    let trackIndex = -1
    let lastT = NaN
    let grid: VectorGrid | null = null
    let gridT = -Infinity
    let gridLayer: FieldLayer = 'none'

    const sizeCanvas = (c: HTMLCanvasElement, w: number, h: number, dpr: number) => {
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
      }
      const ctx = c.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      return ctx
    }

    const frame = () => {
      raf = requestAnimationFrame(frame)
      const v = viewRef.current
      const { day, ui, reduced } = live.current
      const t = playhead.get().t
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const pal = paletteFor(ui.night)
      const [base, field, flow, track, top] = [baseRef.current, fieldRef.current, flowRef.current, trackRef.current, topRef.current]
      if (!base || !field || !flow || !track || !top || v.w < 2) return
      frameNo++

      if (dirty.take('size')) {
        particles.resize(v.w, v.h)
        sizeCanvas(flow, v.w, v.h, dpr).clearRect(0, 0, v.w, v.h)
      }

      if (dirty.take('base')) {
        const ctx = sizeCanvas(base, v.w, v.h, dpr)
        ctx.fillStyle = pal.surface
        ctx.fillRect(0, 0, v.w, v.h)
        // The dimming filter is baked into the tiles here: a CSS filter would run on every composited frame.
        if (ui.basemap !== 'plain') ctx.filter = pal.tileFilter[ui.basemap]
        if (ui.basemap === 'satellite') drawTiles(ctx, v, TILE_LAYERS.sentinel, cache, dpr)
        else if (ui.basemap === 'chart') {
          drawTiles(ctx, v, TILE_LAYERS.nrcanMap, cache, dpr)
          drawTiles(ctx, v, TILE_LAYERS.nrcanLabelsEn, cache, dpr)
        }
        ctx.filter = 'none'
      }

      // The field follows the time in steps of 5 minutes of day time (it changes hourly).
      const layer = ui.layer
      if (dirty.take('field') || layer !== gridLayer || Math.abs(t - gridT) > 5 * 60_000) {
        gridLayer = layer
        gridT = t
        const ctx = sizeCanvas(field, v.w, v.h, dpr)
        ctx.clearRect(0, 0, v.w, v.h)
        const sample = layer === 'none' ? null : sampler(day, layer, t)
        grid = sample && layer !== 'none' ? buildGrid(v, sample, FIELD_SCALE[layer].toKn) : null
        if (grid && layer !== 'none') {
          drawField(ctx, grid, layer === 'currents' ? pal.currentLut : pal.windLut, FIELD_SCALE[layer].maxKn, scratch)
          if (reduced) drawArrows(ctx, grid, FIELD_SCALE[layer].maxKn, pal.ink2)
        }
        if (!grid || reduced) particles.clear(flow.getContext('2d')!)
      }

      // Particles at 30 Hz: half the cost, and the trails still read as flow.
      if (grid && !reduced && layer !== 'none' && frameNo % 2 === 0) {
        const ctx = flow.getContext('2d')!
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        particles.step(ctx, grid, FIELD_SCALE[layer].pxPerUnit, FIELD_SCALE[layer].maxKn, pal.particle)
      }

      // The track grows one ship row (10 s) at a time: redraw it only then, or when the view changes.
      const index = day.ship ? Math.floor((t - day.ship.axis.t0) / day.ship.axis.stepMs) : -1
      if (dirty.take('track') || index !== trackIndex) {
        trackIndex = index
        const tctx = sizeCanvas(track, v.w, v.h, dpr)
        tctx.clearRect(0, 0, v.w, v.h)
        if (day.ship) drawTrack(tctx, v, day.ship, t, ui.trackKey, pal)
      }

      // Vessels move with the time; when paused nothing changes.
      if (!dirty.take('top') && t === lastT) return
      lastT = t
      const ctx = sizeCanvas(top, v.w, v.h, dpr)
      ctx.clearRect(0, 0, v.w, v.h)
      const { snapshot } = live.current
      const target = ui.selected
        ? snapshot.targets.find((x) => x.v.mmsi === ui.selected)
        : snapshot.targets.find((x) => x.danger)
      hits.current = drawVessels(ctx, v, day, t, pal, ui.selected, target ? { lat: target.lat, lon: target.lon } : null)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [cache, dirty, particles, playhead, scratch, viewRef])

  return (
    <div className={`${styles.map} ${className}`}>
      <div ref={box} className={styles.stage} role="application" aria-label="Map of the route with vessels, currents and wind. Drag to pan, pinch to zoom.">
        <canvas ref={baseRef} className={styles.layer} />
        <canvas ref={fieldRef} className={styles.layer} />
        <canvas ref={flowRef} className={styles.layer} />
        <canvas ref={trackRef} className={styles.layer} />
        <canvas ref={topRef} className={styles.layer} />
        <MapOverlay view={view} day={day} t={snapshot.t} showWind={ui.layer === 'wind'} />
      </div>
      <MapLegend />
      <div className={styles.controls}>
        <button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out">
          −
        </button>
        <button
          type="button"
          onClick={() => {
            setFollow(false)
            fit()
          }}
          aria-label="Show the whole route"
        >
          ⤢
        </button>
        <button
          type="button"
          onClick={() => {
            setFollow(false)
            fitRegion()
          }}
          aria-label="Show the Salish Sea and the open Pacific"
        >
          ◎
        </button>
        <button
          type="button"
          aria-pressed={follow}
          onClick={() => {
            markMoved()
            setFollow(!follow)
          }}
          aria-label="Follow own ship"
        >
          ⌖
        </button>
      </div>
      <VesselCallout />
      <Credits basemap={ui.basemap} />
    </div>
  )
}

function Credits({ basemap }: { basemap: string }) {
  const [open, setOpen] = useState(false)
  const tiles = basemap === 'satellite' ? TILE_LAYERS.sentinel.credit : basemap === 'chart' ? TILE_LAYERS.nrcanMap.credit : ''
  const short = basemap === 'satellite' ? TILE_LAYERS.sentinel.short : basemap === 'chart' ? TILE_LAYERS.nrcanMap.short : ''
  const all = [tiles, 'Ocean Networks Canada', 'Fisheries and Oceans Canada (IWLS)', 'Weather data by Open-Meteo.com (CC BY 4.0)'].filter(Boolean)
  return (
    <button type="button" className={styles.credits} aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? all.join(' · ') : `© ${[short, 'ONC', 'DFO', 'Open-Meteo'].filter(Boolean).join(' · ')}`}
    </button>
  )
}
