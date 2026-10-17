import { formatNumber } from '../../../i18n/format'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { TrackMeta } from '../../../types/content'
import type { TrackKey } from '../../../types/feed'
import styles from './TrackColourCard.module.css'
import { RAMP } from './trackColour'

interface Props {
  tracks: TrackMeta[]
  track: TrackMeta
  onSelect: (key: TrackKey) => void
  className?: string
}

/** "Colour the track by" selector with the legend for the selected reading. */
export function TrackColourCard({ tracks, track, onSelect, className = '' }: Props) {
  const { t, lang } = useLanguage()
  return (
    <div className={`${styles.card} ${className}`}>
      <span className={styles.eyebrow}>{t('journey.colourBy')}</span>
      <div className={styles.buttons}>
        {tracks.map((tr) => (
          <button key={tr.key} type="button" aria-pressed={tr.key === track.key} onClick={() => onSelect(tr.key)}>
            {tr.label}
          </button>
        ))}
      </div>
      <div className={styles.legend} style={{ background: `linear-gradient(90deg, ${RAMP.join(', ')})` }} />
      <div className={styles.range}>
        <span>{formatNumber(track.min, 1, lang)} {track.unit}</span>
        <span>{formatNumber(track.max, 1, lang)} {track.unit}</span>
      </div>
    </div>
  )
}
