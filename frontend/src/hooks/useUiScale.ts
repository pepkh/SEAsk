import { useEffect } from 'react'

/** The kiosk screen the layout is designed for (px). */
const DESIGN_W = 1920
const DESIGN_H = 1080
/** At this width or less the layout stacks (mobile rules) and does not scale. */
const STACK_MAX_W = 900
const MAX_SCALE = 2

/** The UI scale for a window size: window ÷ 1920 × 1080, at most 2, and 1 (no scaling) when the layout stacks. */
export function uiScaleFor(w: number, h: number): number {
  return w <= STACK_MAX_W ? 1 : Math.min(MAX_SCALE, w / DESIGN_W, h / DESIGN_H)
}

/**
 * Sets --ui-scale on <html>, so the cards and pages keep their 1920×1080 proportions on any window
 * (CSS `zoom: var(--ui-scale)`). The 3D canvases are never inside a zoomed element:
 * Cesium and three.js read pointer positions in unzoomed pixels.
 */
export function useUiScale() {
  useEffect(() => {
    const root = document.documentElement
    const update = () => {
      root.style.setProperty('--ui-scale', uiScaleFor(window.innerWidth, window.innerHeight).toFixed(4))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
}
