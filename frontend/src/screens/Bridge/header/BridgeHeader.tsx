import { useBridgeData, useBridgeUi, usePlayhead, type Basemap, type FieldLayer } from '../../../bridge/BridgeProvider'
import { usePlayControls, usePlayheadTime } from '../../../bridge/playhead'
import { fmtClockSec, fmtDay, zoneAbbr } from '../../../bridge/time'
import { t } from '../strings'
import { DataStatus } from './DataStatus'
import styles from './BridgeHeader.module.css'
import { Segmented } from './Segmented'

const LAYERS: { value: FieldLayer; label: string }[] = [
  { value: 'currents', label: t('layerCurrents') },
  { value: 'wind', label: t('layerWind') },
  { value: 'none', label: t('layerNone') },
]

const BASEMAPS: { value: Basemap; label: string }[] = [
  { value: 'satellite', label: t('basemapSatellite') },
  { value: 'chart', label: t('basemapChart') },
  { value: 'plain', label: t('basemapPlain') },
]

/** Top bar: what this screen is, the time shown, replay or live, data health and the map choices. */
export function BridgeHeader({ className }: { className: string }) {
  const playhead = usePlayhead()
  const time = usePlayheadTime(playhead, 4, 1000)
  const { speed, follow } = usePlayControls(playhead)
  const { mode, setMode, status } = useBridgeData()
  const ui = useBridgeUi()
  const age = status.ship.state === 'ready' ? status.ship.ageS : undefined
  // Live readings older than 30 s are flagged; past 2 minutes the feed counts as down.
  const stale = mode === 'live' && age !== undefined && age > 30
  // The kiosk and the bridge share the ship feed; without live data both show the sample feed.
  const sample = mode === 'live' && status.ship.state === 'ready' && status.ship.source === 'sample'

  return (
    <header className={`${styles.header} ${className}`}>
      <div className={styles.brand}>
        <span className={styles.title}>{t('title')}</span>
        <span className={styles.route}>{t('route')}</span>
      </div>
      <div className={styles.clock}>
        <b>{fmtClockSec(time)}</b>
        <span>
          {zoneAbbr(time)} · {fmtDay(time)}
        </span>
      </div>
      <span
        className={`${styles.badge} ${mode === 'live' ? styles.live : ''}`}
        data-stale={stale ? (age! > 120 ? 'down' : 'old') : sample ? 'old' : undefined}
        title={sample ? 'The ship is the sample feed (the recorded day, looped), the same one the kiosk shows. Set VITE_LIVE_DATA=true for the ONC feed.' : undefined}
      >
        {mode === 'live' ? (follow ? t('live') : `${t('live')} · rewound`) : `${t('replay')} ${speed}×`}
        {sample && ' · sample feed'}
        {stale && ` · ${Math.round(age!)} s old`}
      </span>
      <Segmented
        label="Mode"
        options={[
          { value: 'replay', label: t('replay') },
          { value: 'live', label: t('live') },
        ]}
        value={mode}
        onChange={setMode}
      />
      <DataStatus />
      <span className={styles.spacer} />
      <Segmented label={t('layers')} options={LAYERS} value={ui.layer} onChange={ui.setLayer} />
      <Segmented label="Basemap" options={BASEMAPS} value={ui.basemap} onChange={ui.setBasemap} />
      <button type="button" className={styles.toggle} aria-pressed={ui.night} onClick={() => ui.setNight(!ui.night)}>
        <MoonIcon /> {t('night')}
      </button>
      <button type="button" className={styles.ask} aria-expanded={ui.askOpen} onClick={() => ui.setAskOpen(!ui.askOpen)}>
        {t('ask')}
      </button>
    </header>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M11.5 10.6A5.5 5.5 0 0 1 5.4 4.5 5.5 5.5 0 1 0 11.5 10.6Z" fill="currentColor" />
    </svg>
  )
}
