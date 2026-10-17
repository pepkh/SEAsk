import { useEffect, useState } from 'react'
import styles from './MapScene.module.css'

/** Shown for this long after a tap (ms). */
const OPEN_MS = 8000

/**
 * Licence attribution for the map: a short line in the corner, the full text on tap.
 * Cesium's own credit box is hidden in MapScene.module.css.
 */
export function MapCredits({ short, full }: { short: string; full: string }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => setOpen(false), OPEN_MS)
    return () => window.clearTimeout(id)
  }, [open])
  return (
    <button type="button" className={`${styles.credits} ${open ? styles.creditsOpen : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? full : `© ${short}`}
    </button>
  )
}
