import { useEffect, useRef } from 'react'

const INPUTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/**
 * Calls `onIdle` once after `ms` with no touch, key or wheel input anywhere; any input starts the wait again.
 * Off while `enabled` is false.
 */
export function useIdle(ms: number, onIdle: () => void, enabled = true) {
  const callback = useRef(onIdle)
  useEffect(() => {
    callback.current = onIdle
  })

  useEffect(() => {
    if (!enabled) return
    let id = window.setTimeout(() => callback.current(), ms)
    const reset = () => {
      window.clearTimeout(id)
      id = window.setTimeout(() => callback.current(), ms)
    }
    for (const type of INPUTS) window.addEventListener(type, reset, { capture: true, passive: true })
    return () => {
      window.clearTimeout(id)
      for (const type of INPUTS) window.removeEventListener(type, reset, { capture: true })
    }
  }, [ms, enabled])
}
