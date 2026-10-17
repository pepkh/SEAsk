import { useEffect } from 'react'
import { Bubble } from '../../components/Bubble/Bubble'
import { useGuideSpot } from '../../components/Guide/GuideContext'
import { HUB_PATH } from '../../components/WaterTransition/levels'
import { useTransition } from '../../components/WaterTransition/TransitionContext'
import { useKiosk } from '../../context/KioskContext'
import { useLanguage } from '../../i18n/LanguageContext'
import styles from './Welcome.module.css'
import { WelcomeArt } from './WelcomeArt'

/**
 * Welcome (home): "Welcome to SEAsk · Touch to explore". No session, so no live data, no API requests and no
 * 3D world. While it waits, the code of the 3D scene loads in the background so the first tap is quick.
 */
export function Welcome() {
  const { t, toggle } = useLanguage()
  const { go, run } = useTransition()
  const { sceneMode } = useKiosk()
  useGuideSpot('welcome')

  useEffect(() => {
    const load = () => (sceneMode === 'map' ? import('../../map/KidsMap') : import('../../scene/SeaScene'))
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const id = idle(() => void load())
    return () => cancel(id)
  }, [sceneMode])

  const tapped = run?.kind === 'pop'
  return (
    <div className={styles.screen}>
      <WelcomeArt mode={tapped ? 'wobble' : 'idle'} onStart={() => go(HUB_PATH)} />
      <div className={styles.corner}>
        <Bubble size={92} bob={2} aria-label={t('language.label')} onClick={toggle}>
          <span className={styles.lang}>{t('language.button')}</span>
        </Bubble>
      </div>
    </div>
  )
}
