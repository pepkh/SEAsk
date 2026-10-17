import { Cartographic, defined, Math as CesiumMath, ScreenSpaceEventHandler, ScreenSpaceEventType, type Cartesian2 } from 'cesium'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCesium } from 'resium'
import { KnowledgeIcon } from '../components/KnowledgeIcon/KnowledgeIcon'
import { useContent } from '../hooks/useContent'
import { formatNumber } from '../i18n/format'
import { useLanguage } from '../i18n/LanguageContext'
import { findLandmark, findLandmarkById } from './findLandmark'
import styles from './Landmarks.module.css'
import { WATER_HEIGHT } from './shipTrack'

/** Pointer checks while hovering, at most one per this time (ms). */
const HOVER_MS = 60
/** A tapped label stays this long (ms). */
const PINNED_MS = 8000
/** Above this height (m) the pointer is on land, below it on the water. */
const LAND_MIN_M = WATER_HEIGHT + 2
/** Labels nearer the right edge than this open to the left of the pointer (px). */
const FLIP_PX = 380
/** Specialties shown on a label, at most */
const CHIPS = 3

interface Shown {
  id: string
  x: number
  y: number
}

/**
 * Names of the mountains, islands, places and channels around the route: on hover (mouse) or tap (touch kiosk).
 * `onOpenChange` tells the map when a label opens or closes (the idle camera stops circling meanwhile).
 */
export function Landmarks({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { viewer } = useCesium()
  const texts = useContent('landmarks')
  const { t, lang } = useLanguage()
  const [shown, setShown] = useState<Shown | null>(null)

  useEffect(() => {
    if (!viewer) return
    const { scene } = viewer
    const handler = new ScreenSpaceEventHandler(scene.canvas)
    let lastHover = 0
    let dragging = false
    let pinnedUntil = 0
    let unpin: number | undefined

    const landmarkAt = (pos: Cartesian2) => {
      // Nothing under the ferry, its wake or the route lines; terrain and water are not pickable objects.
      if (!scene.pickPositionSupported || defined(scene.pick(pos))) return undefined
      const hit = scene.pickPosition(pos)
      const c = hit && Cartographic.fromCartesian(hit)
      if (!c) return undefined
      return findLandmark(CesiumMath.toDegrees(c.latitude), CesiumMath.toDegrees(c.longitude), c.height > LAND_MIN_M)
    }

    handler.setInputAction(() => (dragging = true), ScreenSpaceEventType.LEFT_DOWN)
    handler.setInputAction(() => (dragging = false), ScreenSpaceEventType.LEFT_UP)
    handler.setInputAction((e: ScreenSpaceEventHandler.MotionEvent) => {
      const now = performance.now()
      if (dragging || now < pinnedUntil || now - lastHover < HOVER_MS) return
      lastHover = now
      const mark = landmarkAt(e.endPosition)
      setShown(mark ? { id: mark.id, x: e.endPosition.x, y: e.endPosition.y } : null)
    }, ScreenSpaceEventType.MOUSE_MOVE)
    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      window.clearTimeout(unpin)
      const mark = landmarkAt(e.position)
      pinnedUntil = mark ? performance.now() + PINNED_MS : 0
      setShown(mark ? { id: mark.id, x: e.position.x, y: e.position.y } : null)
      if (mark) unpin = window.setTimeout(() => setShown(null), PINNED_MS)
    }, ScreenSpaceEventType.LEFT_CLICK)

    const leave = () => {
      if (performance.now() >= pinnedUntil) setShown(null)
    }
    scene.canvas.addEventListener('pointerleave', leave)
    return () => {
      handler.destroy()
      window.clearTimeout(unpin)
      scene.canvas.removeEventListener('pointerleave', leave)
    }
  }, [viewer])

  const open = shown !== null
  useEffect(() => onOpenChange(open), [open, onOpenChange])

  const mark = shown && findLandmarkById(shown.id)
  const text = shown && texts?.[shown.id]
  if (!viewer || !shown || !mark || !text) return null
  const flip = shown.x > viewer.container.clientWidth - FLIP_PX
  const kind = t(`journey.landmarks.kinds.${mark.kind}`)
  const height = mark.elevationM && t('journey.landmarks.height', { m: formatNumber(Math.round(mark.elevationM / 10) * 10, 0, lang) })

  return createPortal(
    <div className={`${styles.anchor} ${flip ? styles.flip : ''}`} style={{ left: shown.x, top: shown.y }}>
      <span className={styles.dot} />
      <div className={styles.card} role="status">
        <span className={styles.kind}>{height ? `${kind} · ${height}` : kind}</span>
        <b className={styles.name}>{text.name}</b>
        <span className={styles.fact}>{text.fact}</span>
        {text.knowledge?.specialties && (
          <span className={styles.chips}>
            {text.knowledge.specialties.slice(0, CHIPS).map((s) => (
              <span key={s.text} className={styles.chip}>
                <KnowledgeIcon kind={s.kind} size={16} />
                {s.text}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>,
    viewer.container,
  )
}
