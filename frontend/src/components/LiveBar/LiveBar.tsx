import { useLanguage } from '../../i18n/LanguageContext'
import { useTimeShift } from '../../ship/ShipProvider'
import type { ReplaySpeed } from '../../ship/shipContext'
import { Bubble } from '../Bubble/Bubble'
import { Card } from '../Card/Card'
import styles from './LiveBar.module.css'

const SPEEDS: ReplaySpeed[] = [1, 4, 10]

/** "12 min ago", or "Moments ago" under a minute. */
// eslint-disable-next-line react/only-export-components
export function useAgo(): string {
  const { t } = useLanguage()
  const { behindMs } = useTimeShift()
  const min = Math.round(behindMs / 60_000)
  return min < 1 ? t('live.agoNow') : t('live.agoMin', { min })
}

/**
 * While rewound, like a live stream: how far back we are and where (a card), then pause / play, the speed and
 * Go Live (bubbles).
 */
export function LiveBar({ place, className = '' }: { place: string; className?: string }) {
  const { t } = useLanguage()
  const { playing, speed, setPlaying, setSpeed, goLive } = useTimeShift()
  const ago = useAgo()

  return (
    <div className={`${styles.bar} ${className}`} role="group" aria-label={t('live.label')}>
      <Card className={styles.status}>
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12a8 8 0 1 0 2.4-5.7" />
          <path d="M4 4v4h4" />
          <path d="M12 8v4l3 2" />
        </svg>
        <span>
          <b>{ago}</b> · {place}
        </span>
      </Card>
      <Bubble size={84} bob={0.4} aria-label={t(playing ? 'live.pause' : 'live.play')} onClick={() => setPlaying(!playing)}>
        {playing ? (
          <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
            <path d="M8 5l11 7-11 7z" fill="currentColor" />
          </svg>
        )}
      </Bubble>
      <Bubble size={84} bob={1.8} aria-label={t('live.speed', { n: speed })} onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}>
        <b className={styles.speed}>{speed}×</b>
      </Bubble>
      <Bubble size={128} bob={2.9} tone="live" aria-label={t('live.goLiveLabel')} onClick={goLive}>
        <span className={styles.live}>
          <i />
          {t('live.goLive')}
        </span>
      </Bubble>
    </div>
  )
}
