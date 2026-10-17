import { useEffect } from 'react'

/** The kiosk screen the layout is designed for (px). */
const DESIGN_W = 1920
const DESIGN_H = 1080
/** At this width or less the layout stacks (mobile rules) and does not scale. */
const STACK_MAX_W = 900
const MAX_SCALE = 2

/**
 * Sets --ui-scale on <html>, so the cards and pages keep their 1920×1080 proportions on any window
 * (CSS `zoom: var(--ui-scale)`). The 3D canvases are never inside a zoomed element:
 * Cesium and three.js read pointer positions in unzoomed pixels.
 */
export function useUiScale() {
  useEffect(() => {
    const root = document.documentElement
    const update = () => {
      const { innerWidth: w, innerHeight: h } = window
      const scale = w <= STACK_MAX_W ? 1 : Math.min(MAX_SCALE, w / DESIGN_W, h / DESIGN_H)
      root.style.setProperty('--ui-scale', scale.toFixed(4))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
}
