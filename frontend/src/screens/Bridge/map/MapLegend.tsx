import { useBridgeData, useBridgeUi, useSnapshot, type TrackKey } from '../../../bridge/BridgeProvider'
import { fmtClock, fmtDuration } from '../../../bridge/time'
import { TRACK_RANGE } from '../../../bridge/map/render'
import { FOULING } from '../../../bridge/derive/fouling'
import { FIELD_SCALE } from '../../../bridge/map/flow'
import { fieldLut, lutColor, paletteFor } from '../../../bridge/palette'
import { short } from '../../../config/sources'
import { RAMP } from '../../Lab/trackColour'
import { dayLabel } from '../strings'
import styles from './BridgeMap.module.css'

const TRACK_LABELS: Record<TrackKey, string> = {
  sstC: 'Sea temp °C',
  sal: 'Salinity psu',
  o2Sat: 'O₂ sat %',
  chl: 'Chlorophyll µg/l',
  turb: 'Turbidity NTU',
  sogKn: 'Speed kn',
  rollDeg: 'Roll °',
}

const FIELD_TITLE = { currents: 'Surface current, kn', wind: 'Wind at 10 m, kn', fouling: 'Biofouling index (experimental)' }
const FIELD_TICKS = { currents: [0, 1, 2, 3, 4], wind: [0, 5, 10, 15, 20, 25], fouling: [0, 25, 50, 75, 100] }

/** Map key: the field scale, the track reading (tap to change it) and the vessel symbols. */
export function MapLegend() {
  const ui = useBridgeUi()
  const { day, mode, status } = useBridgeData()
  const snap = useSnapshot()
  const pal = paletteFor(ui.night)
  // Live: say how old the newest radar map is.
  const radarEnd = day.currents ? day.currents.axis.t0 + (day.currents.axis.n - 1) * day.currents.axis.stepMs : NaN
  const radarAge = mode === 'live' && Number.isFinite(radarEnd) ? snap.t - radarEnd : NaN
  const layer = ui.layer
  const range = TRACK_RANGE[ui.trackKey]
  const fieldMissing =
    (layer === 'currents' && !day.currents && !day.ocean) || (layer === 'wind' && !day.weather?.windU && !day.weather?.wide) || (layer === 'fouling' && !day.fouling)
  const missingText = layer === 'fouling' && status.fouling.state === 'missing' ? `Biofouling: ${status.fouling.reason}` : 'No data for this layer'
  // The biofouling model ran for one day: on any other day (live) say the map is that day's.
  const otherDay = day.fouling && day.fouling.date !== day.date

  return (
    <div className={styles.legend}>
      {layer !== 'none' && (
        <section>
          <h4>{FIELD_TITLE[layer]}</h4>
          {fieldMissing ? (
            <p className={styles.note}>{missingText}</p>
          ) : (
            <>
              <div
                className={styles.bar}
                style={{
                  background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1]
                    .map((k) => lutColor(fieldLut(pal, layer), k, 1))
                    .join(',')})`,
                }}
              />
              <div className={styles.ticks}>
                {FIELD_TICKS[layer].map((v) => (
                  <span key={v} style={{ left: `${(v / FIELD_SCALE[layer].maxKn) * 100}%` }}>
                    {v}
                  </span>
                ))}
              </div>
              {layer === 'currents' && (
                <p className={styles.note}>
                  {day.currents ? `Measured by ${short('onc')} radar (CODAR) in the open Strait` : 'No radar data'}
                  {day.ocean ? `; elsewhere model: ${[...new Set(day.ocean.layers.map((l) => l.label))].join(', ')}` : '; model currents not loaded'}
                </p>
              )}
              {layer === 'wind' && (
                <p className={styles.note}>
                  {day.windobs ? `Measured at ${day.windobs.stations.length} ${short('eccc')} stations (arrows)` : 'No station data'}
                  {day.weather ? `; elsewhere model: ${short('openMeteo')}` : '; wind model not loaded'}
                </p>
              )}
              {layer === 'fouling' && day.fouling && (
                <>
                  <p className={styles.note}>
                    Relative 0–100, higher = more likely to foul a hull. Route stretches at {FOULING.elevated} or more: F1, F2…
                  </p>
                  <p className={styles.note}>
                    <i className={styles.hatch} aria-hidden="true" />
                    Hatched: outside the model’s training area (no estimate)
                  </p>
                  <p className={styles.note}>
                    {short('seaskFouling')}, unvalidated screening proxy · model run {dayLabel(day.fouling.date)}
                    {otherDay && ' (not today)'} · cells ~3 × 4.6 km
                  </p>
                </>
              )}
              {layer === 'currents' && radarAge > 30 * 60_000 && (
                <p className={styles.note}>
                  Newest radar map {fmtClock(radarEnd)} ({fmtDuration(radarAge)} old)
                </p>
              )}
            </>
          )}
        </section>
      )}
      <section>
        <h4>Track colour</h4>
        <div className={styles.trackKeys} role="radiogroup" aria-label="Track colour">
          {(Object.keys(TRACK_LABELS) as TrackKey[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={ui.trackKey === k} onClick={() => ui.setTrackKey(k)}>
              {TRACK_LABELS[k].split(' ')[0]}
            </button>
          ))}
        </div>
        <div className={styles.bar} style={{ background: pal.night ? 'linear-gradient(to right, #5a0a08, #ff4a3d)' : `linear-gradient(to right, ${RAMP.join(',')})` }} />
        <div className={styles.rangeRow}>
          <span>{range.min}</span>
          <span>{TRACK_LABELS[ui.trackKey]}</span>
          <span>{range.max}</span>
        </div>
      </section>
      {day.traffic && (
        <section>
          <h4>Vessels (AIS)</h4>
          <ul className={styles.aisKey}>
            <li><i style={{ background: pal.own }} />Own ship</li>
            <li><i style={{ background: pal.ais.passenger }} />Passenger</li>
            <li><i style={{ background: pal.ais.cargo }} />Cargo, tanker</li>
            <li><i style={{ background: pal.ais.service }} />Tug, fishing, service</li>
            <li><i style={{ background: pal.ais.other }} />Other</li>
          </ul>
        </section>
      )}
    </div>
  )
}
