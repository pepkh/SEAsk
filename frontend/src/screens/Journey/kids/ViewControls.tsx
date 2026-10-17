import { GlobeIcon, SideViewIcon, TopViewIcon } from '../../../components/icons'
import { useKiosk } from '../../../context/KioskContext'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { ViewName } from '../../../scene/constants'
import styles from './ViewControls.module.css'

interface Props {
  view: ViewName
  onView: (view: ViewName) => void
  className?: string
}

/** Camera buttons (3D / side / top) and, when map mode is on, the Sea/Map button. */
export function ViewControls({ view, onView, className = '' }: Props) {
  const { t } = useLanguage()
  const { sceneMode, setSceneMode, mapAvailable } = useKiosk()
  const buttons = [
    { name: 'chase', label: t('journey.views.chase'), icon: '3D' },
    { name: 'side', label: t('journey.views.side'), icon: <SideViewIcon /> },
    { name: 'top', label: t('journey.views.top'), icon: <TopViewIcon /> },
  ] as const

  return (
    <div className={`${styles.ctrls} ${className}`}>
      {buttons.map(({ name, label, icon }) => (
        <button key={name} type="button" className={`${styles.cbtn} ${styles.glass}`} aria-pressed={view === name} aria-label={label} onClick={() => onView(name)}>
          {icon}
        </button>
      ))}
      {mapAvailable && <SceneModeButton variant="glass" mode={sceneMode} onToggle={() => setSceneMode(sceneMode === 'sea' ? 'map' : 'sea')} />}
    </div>
  )
}

interface SceneModeProps {
  variant: 'glass' | 'floating'
  mode: 'sea' | 'map'
  onToggle: () => void
  className?: string
}

/** Globe button: switch the background between the 3D sea and the Cesium map. */
export function SceneModeButton({ variant, mode, onToggle, className = '' }: SceneModeProps) {
  const { t } = useLanguage()
  return (
    <button
      type="button"
      className={`${styles.cbtn} ${styles[variant]} ${className}`}
      aria-pressed={mode === 'map'}
      aria-label={t(mode === 'map' ? 'journey.views.showSea' : 'journey.views.showMap')}
      onClick={onToggle}
    >
      <GlobeIcon />
    </button>
  )
}
