import { useEffect, useState } from 'react'
import { Bubble } from '../../components/Bubble/Bubble'
import { GlobeIcon, SideViewIcon, TopViewIcon } from '../../components/icons'
import { useKiosk } from '../../context/KioskContext'
import { useLanguage } from '../../i18n/LanguageContext'
import type { ViewName } from '../../scene/constants'
import styles from './ViewBubble.module.css'

/** The fanned-out choices close again after this time with no tap (ms). */
const CLOSE_MS = 5000

const CameraIcon = () => (
  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
)

/** One small bubble for the camera; a tap fans out the three views and the sea / map switch. */
export function ViewBubble() {
  const { t } = useLanguage()
  const { view, setView, sceneMode, setSceneMode, mapAvailable } = useKiosk()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => setOpen(false), CLOSE_MS)
    return () => clearTimeout(id)
  }, [open, view, sceneMode])

  const views: { name: ViewName; label: string; icon: React.ReactNode }[] = [
    { name: 'chase', label: t('bubbles.views.chase'), icon: <b className={styles.three}>3D</b> },
    { name: 'side', label: t('bubbles.views.side'), icon: <SideViewIcon /> },
    { name: 'top', label: t('bubbles.views.top'), icon: <TopViewIcon /> },
  ]

  return (
    <div className={styles.wrap}>
      <Bubble size={92} bob={4.1} aria-label={t('bubbles.view')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <CameraIcon />
      </Bubble>
      {open && (
        <div className={styles.fan}>
          {views.map(({ name, label, icon }, i) => (
            <Bubble
              key={name}
              size={76}
              bob={i}
              tone={view === name ? 'accent' : 'glass'}
              aria-label={label}
              aria-pressed={view === name}
              onClick={() => setView(name)}
            >
              {icon}
            </Bubble>
          ))}
          {mapAvailable && (
            <Bubble
              size={76}
              bob={3}
              tone={sceneMode === 'map' ? 'accent' : 'glass'}
              aria-label={t(sceneMode === 'map' ? 'bubbles.views.sea' : 'bubbles.views.map')}
              aria-pressed={sceneMode === 'map'}
              onClick={() => setSceneMode(sceneMode === 'map' ? 'sea' : 'map')}
            >
              <GlobeIcon />
            </Bubble>
          )}
        </div>
      )}
    </div>
  )
}
