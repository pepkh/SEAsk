import { useBridgeData, usePlayhead } from '../../../bridge/BridgeProvider'
import { SPEEDS, usePlayControls, usePlayheadTime } from '../../../bridge/playhead'
import { fmtClock, fmtDuration, MINUTE } from '../../../bridge/time'
import { t } from '../strings'
import styles from './Timeline.module.css'

/** Start, back, play/pause, forward, end, the speed, and where the ship is in the day's sailings. */
export function PlayControls() {
  const playhead = usePlayhead()
  const { playing, speed, follow } = usePlayControls(playhead)
  const now = usePlayheadTime(playhead, 4, MINUTE)
  const { day, mode } = useBridgeData()
  const crossings = day.ship?.crossings ?? []
  const current = crossings.find((c) => c.start <= now && now <= c.end)
  const next = crossings.find((c) => c.start > now)
  const jump = (dt: number) => playhead.seek(playhead.get().t + dt)

  return (
    <div className={styles.controls}>
      <button type="button" onClick={() => playhead.seek(day.dayStart)} aria-label={t('toStart')}>
        ⏮
      </button>
      <button type="button" onClick={() => jump(-10 * MINUTE)} aria-label={t('back10')}>
        −10
      </button>
      <button type="button" className={styles.play} onClick={() => playhead.setPlaying(!playing)} aria-label={playing ? t('pause') : t('play')}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button type="button" onClick={() => jump(10 * MINUTE)} aria-label={t('forward10')}>
        +10
      </button>
      <button type="button" onClick={() => playhead.seek(day.dayEnd)} aria-label={t('toEnd')}>
        ⏭
      </button>
      <div className={styles.speeds} role="radiogroup" aria-label={t('speed')}>
        {SPEEDS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={() => playhead.setSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
      <span className={styles.readout}>{fmtClock(now)}</span>
      {mode === 'live' && !follow && (
        <button type="button" className={styles.backLive} onClick={() => playhead.goLive(Date.now())}>
          ● Back to live
        </button>
      )}
      <span className={styles.chip}>
        {current
          ? `Crossing ${current.id} · ${current.direction === 'swb_to_tsa' ? 'Swartz Bay → Tsawwassen' : 'Tsawwassen → Swartz Bay'}`
          : next
            ? `At berth · next sailing ${fmtClock(next.start)} (in ${fmtDuration(next.start - now)})`
            : mode === 'live'
              ? 'Between crossings'
              : 'At berth · no more sailings'}
      </span>
    </div>
  )
}
