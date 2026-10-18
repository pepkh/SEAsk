import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { fitArea, latToY, lonToX, worldPx, zoomAround, type Area, type View } from './mercator'

const MAX_ZOOM = 14.5
const TAP_PX = 8
const DOUBLE_TAP_MS = 320

interface Options {
  /** Area shown at first and by "fit" */
  area: Area
  /** The whole area the map can show (pan and zoom-out limit) */
  region: Area
  /** A tap (no drag) at screen x, y */
  onTap: (x: number, y: number) => void
  /** Called whenever the view changes (every pointer move): mark the canvases dirty */
  onChange: () => void
}

/**
 * The map view and its touch gestures: drag to pan, pinch or wheel to zoom, double-tap to zoom in.
 * The view lives in a ref for the canvas loop; `view` (React state) follows it once per frame for the
 * SVG overlay.
 */
const START: View = { cx: 0.15, cy: 0.35, zoom: 10, w: 1, h: 1 }

export function useMapView(el: RefObject<HTMLDivElement | null>, { area, region, onTap, onChange }: Options) {
  const viewRef = useRef<View>(START)
  const [view, setView] = useState<View>(START)
  const moved = useRef(false)
  const raf = useRef(0)
  const handlers = useRef({ onTap, onChange })
  useLayoutEffect(() => {
    handlers.current = { onTap, onChange }
  })

  const publish = useCallback(() => {
    handlers.current.onChange()
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      setView(viewRef.current)
    })
  }, [])

  const clamp = useCallback((v: View): View => {
    // Out as far as the whole region, in to street level.
    const minZoom = fitArea(region, v.w, v.h, 0).zoom
    const zoom = Math.min(MAX_ZOOM, Math.max(minZoom, v.zoom))
    const half = (px: number) => px / 2 / worldPx(zoom)
    const x0 = lonToX(region.west) + half(v.w)
    const x1 = lonToX(region.east) - half(v.w)
    const y0 = latToY(region.north) + half(v.h)
    const y1 = latToY(region.south) - half(v.h)
    return {
      ...v,
      zoom,
      cx: x0 < x1 ? Math.min(x1, Math.max(x0, v.cx)) : (x0 + x1) / 2,
      cy: y0 < y1 ? Math.min(y1, Math.max(y0, v.cy)) : (y0 + y1) / 2,
    }
  }, [region])

  const set = useCallback(
    (v: View) => {
      viewRef.current = clamp(v)
      publish()
    },
    [clamp, publish],
  )

  /** Back to the route area. */
  const fit = useCallback(() => {
    const { w, h } = viewRef.current
    moved.current = false
    set(fitArea(area, w, h, 28))
  }, [area, set])

  /** Out to the whole region (the Salish Sea and the open Pacific). */
  const fitRegion = useCallback(() => {
    const { w, h } = viewRef.current
    moved.current = true
    set(fitArea(region, w, h, 0))
  }, [region, set])

  const zoomBy = useCallback((dz: number) => {
    const v = viewRef.current
    set(zoomAround(v, v.w / 2, v.h / 2, v.zoom + dz))
    moved.current = true
  }, [set])

  /** Centre on a place, keeping the zoom. */
  const centreOn = useCallback((lat: number, lon: number) => {
    set({ ...viewRef.current, cx: lonToX(lon), cy: latToY(lat) })
  }, [set])

  // Size: follow the element; refit until the user has moved the map.
  useEffect(() => {
    const node = el.current
    if (!node) return
    const observer = new ResizeObserver(() => {
      const { width, height } = node.getBoundingClientRect()
      viewRef.current = { ...viewRef.current, w: Math.max(1, width), h: Math.max(1, height) }
      if (!moved.current) fit()
      else set(viewRef.current)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [el, area, fit, set])

  // Gestures.
  useEffect(() => {
    const node = el.current
    if (!node) return
    const pointers = new Map<number, { x: number; y: number }>()
    let start: { x: number; y: number; time: number; view: View; dist: number; mid: [number, number] } | null = null
    let travel = 0
    let lastTap = 0

    const local = (e: PointerEvent | WheelEvent) => {
      const r = node.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const pinch = () => {
      const [a, b] = [...pointers.values()]
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: [(a.x + b.x) / 2, (a.y + b.y) / 2] as [number, number] }
    }
    const begin = (time: number) => {
      const p = [...pointers.values()][0]
      const two = pointers.size >= 2 ? pinch() : { dist: 0, mid: [p.x, p.y] as [number, number] }
      start = { x: p.x, y: p.y, time, view: viewRef.current, ...two }
    }

    const down = (e: PointerEvent) => {
      node.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, local(e))
      if (pointers.size === 1) travel = 0
      begin(e.timeStamp)
    }
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId) || !start) return
      const prev = pointers.get(e.pointerId)!
      const p = local(e)
      travel += Math.hypot(p.x - prev.x, p.y - prev.y)
      pointers.set(e.pointerId, p)
      const s = worldPx(start.view.zoom)
      if (pointers.size >= 2) {
        const { dist, mid } = pinch()
        const zoomed = zoomAround(start.view, start.mid[0], start.mid[1], start.view.zoom + Math.log2(dist / Math.max(1, start.dist)))
        const s2 = worldPx(zoomed.zoom)
        set({ ...zoomed, cx: zoomed.cx - (mid[0] - start.mid[0]) / s2, cy: zoomed.cy - (mid[1] - start.mid[1]) / s2 })
      } else {
        set({ ...start.view, cx: start.view.cx - (p.x - start.x) / s, cy: start.view.cy - (p.y - start.y) / s })
      }
      if (travel > TAP_PX) moved.current = true
    }
    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      const p = local(e)
      pointers.delete(e.pointerId)
      if (pointers.size === 0 && travel <= TAP_PX && start) {
        if (e.timeStamp - lastTap < DOUBLE_TAP_MS) {
          moved.current = true
          set(zoomAround(viewRef.current, p.x, p.y, viewRef.current.zoom + 1))
          lastTap = 0
        } else {
          lastTap = e.timeStamp
          handlers.current.onTap(p.x, p.y)
        }
      }
      if (pointers.size) begin(e.timeStamp)
      else start = null
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = local(e)
      moved.current = true
      set(zoomAround(viewRef.current, p.x, p.y, viewRef.current.zoom - e.deltaY * 0.0025))
    }

    node.addEventListener('pointerdown', down)
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerup', up)
    node.addEventListener('pointercancel', up)
    node.addEventListener('wheel', wheel, { passive: false })
    return () => {
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up)
      node.removeEventListener('pointercancel', up)
      node.removeEventListener('wheel', wheel)
    }
  }, [el, set])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  /** The user moved the map: stop refitting it on resize. */
  const markMoved = useCallback(() => {
    moved.current = true
  }, [])

  return { view, viewRef, fit, fitRegion, zoomBy, centreOn, markMoved }
}
