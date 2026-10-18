import { useBridgeData, useBridgeUi, useSnapshot } from '../../../bridge/BridgeProvider'
import type { PartStatus } from '../../../bridge/model'
import { extent } from '../../../bridge/series'
import { fmtClock, fmtDuration } from '../../../bridge/time'
import type { StationSeriesKey } from '../../../types/bridge'
import { DepthProfile } from '../charts/DepthProfile'
import { MiniCurrent } from '../charts/MiniCurrent'
import { MiniTide } from '../charts/MiniTide'
import { compass, deg, num, t } from '../strings'
import { Arrow, Empty, Section, Stat } from './parts'
import styles from './Rail.module.css'

const notReady = (s: PartStatus) => (s.state === 'loading' ? t('loading') : t('missing'))

const DEEP_ROWS: { key: StationSeriesKey; label: string; unit: string; digits: number }[] = [
  { key: 'tempC', label: 'Temp', unit: '°C', digits: 2 },
  { key: 'sal', label: 'Salinity', unit: 'psu', digits: 2 },
  { key: 'o2Sat', label: 'O₂ sat', unit: '%', digits: 0 },
  { key: 'o2MlL', label: 'O₂', unit: 'ml/l', digits: 2 },
  { key: 'chl', label: 'Chl', unit: 'µg/l', digits: 2 },
  { key: 'turb', label: 'Turbidity', unit: 'NTU', digits: 2 },
]

/** Right rail: tides and the Active Pass current, wind, sea and sky, deep water, the other ferry and traffic. */
export function ConditionsRail({ className }: { className: string }) {
  const snap = useSnapshot()
  const { day, status, mode } = useBridgeData()
  const ui = useBridgeUi()
  const tides = day.tides
  const domain = tides ? tideDomain(tides.stations.map((s) => s.h)) : null

  return (
    <aside className={`${styles.rail} ${className}`} aria-label={t('conditions')}>
      <Section title={t('activePass')} aside={snap.current ? `${snap.current.station}` : undefined}>
        {tides?.current && snap.current ? (
          <>
            <div className={styles.pair}>
              <Stat
                label={snap.current.flooding === null ? 'Current' : snap.current.flooding ? t('flood') : t('ebb')}
                value={num(snap.current.kn)}
                unit="kn"
                size="lg"
                sub={
                  <>
                    <Arrow toward={snap.current.towardDeg} size={12} /> toward {deg(snap.current.towardDeg)}
                  </>
                }
              />
              <Stat
                label="Next slack"
                value={snap.current.nextSlack ? fmtClock(snap.current.nextSlack) : '—'}
                sub={snap.current.nextSlack ? `in ${fmtDuration(snap.current.nextSlack - snap.t)}` : undefined}
              />
            </div>
            <MiniCurrent axis={tides.axis} current={tides.current} dayStart={day.dayStart} dayEnd={day.dayEnd} t={snap.t} />
            {snap.current.nextMax && (
              <p className={styles.muted}>
                Max {snap.current.nextMax.type} {num(snap.current.nextMax.kn)} kn at {fmtClock(snap.current.nextMax.t)}
              </p>
            )}
          </>
        ) : (
          <Empty text={notReady(status.tides)} />
        )}
      </Section>

      <Section title={t('tides')} aside="m above chart datum">
        {tides && domain ? (
          <div className={styles.tides}>
            {tides.stations.map((s, i) => {
              const now = snap.tides[i]
              return (
                <div key={s.code} className={styles.tideRow}>
                  <div className={styles.tideHead}>
                    <b>{s.name}</b>
                    <span>
                      {num(now?.h, 2)} m {now?.rising === null ? '' : now?.rising ? `↑ ${t('rising')}` : `↓ ${t('falling')}`}
                    </span>
                    {now?.next && (
                      <em>
                        {now.next.type === 'high' ? 'HW' : 'LW'} {fmtClock(now.next.t)} {num(now.next.h, 1)} m
                      </em>
                    )}
                  </div>
                  <MiniTide axis={tides.axis} station={s} domain={domain} dayStart={day.dayStart} dayEnd={day.dayEnd} t={snap.t} />
                </div>
              )
            })}
          </div>
        ) : (
          <Empty text={notReady(status.tides)} />
        )}
      </Section>

      <Section title={t('wind')}>
        {snap.wind.atShip || snap.wind.nearest ? (
          <>
            <div className={styles.pair}>
              <Stat
                label={snap.wind.atShip?.source.kind === 'measured' ? t('windMeasured') : t('windModel')}
                value={num(snap.wind.atShip?.kn)}
                unit="kn"
                size="lg"
                sub={
                  snap.wind.atShip ? (
                    <>
                      <Arrow toward={(snap.wind.atShip.fromDeg + 180) % 360} size={12} /> from {compass(snap.wind.atShip.fromDeg)}
                      {Number.isFinite(snap.wind.atShip.gustKn) && ` · ${t('gust')} ${num(snap.wind.atShip.gustKn, 0)}`}
                      {` · ${snap.wind.atShip.source.kind === 'measured' ? snap.wind.atShip.source.station : snap.wind.atShip.source.label}`}
                    </>
                  ) : undefined
                }
              />
              <Stat
                label={snap.wind.nearest ? `${snap.wind.nearest.name} · ${num(snap.wind.nearest.distKm, 0)} km` : t('windNearest')}
                value={num(snap.wind.nearest?.kn)}
                unit="kn"
                size="lg"
                sub={
                  snap.wind.nearest ? (
                    <>
                      <Arrow toward={(snap.wind.nearest.fromDeg + 180) % 360} size={12} /> {snap.wind.nearest.kn === 0 ? 'calm' : `from ${compass(snap.wind.nearest.fromDeg)}`}
                      {Number.isFinite(snap.wind.nearest.gustKn) && ` · ${t('gust')} ${num(snap.wind.nearest.gustKn, 0)}`} · measured
                    </>
                  ) : (
                    notReady(status.windobs)
                  )
                }
              />
            </div>
            {snap.wind.ionaSuspect && <p className={styles.muted}>ONC Iona anemometer reads ~0 all day (stuck): not used.</p>}
          </>
        ) : (
          <Empty text={notReady(status.weather)} />
        )}
      </Section>

      <Section title={t('sea')}>
        <div className={styles.triple}>
          <Stat label={t('waves')} value={num(snap.sea.waveM, 2)} unit="m" sub={Number.isFinite(snap.sea.wavePeriodS) ? `${num(snap.sea.wavePeriodS)} s from ${compass(snap.sea.waveFromDeg)}` : undefined} />
          <Stat label={t('visibility')} value={num(snap.sea.visKm, 0)} unit="km" />
          <Stat label={t('cloud')} value={num(snap.sea.cloudPct, 0)} unit="%" sub={Number.isFinite(snap.sea.precipMm) ? `${t('rain')} ${num(snap.sea.precipMm)} mm/h` : undefined} />
        </div>
        <div className={styles.pair}>
          <Stat
            label={snap.surfaceCurrent?.source.kind === 'model' ? t('surfaceCurrentModel') : t('surfaceCurrent')}
            value={num(snap.surfaceCurrent?.kn)}
            unit="kn"
            sub={
              snap.surfaceCurrent ? (
                <>
                  <Arrow toward={snap.surfaceCurrent.towardDeg} size={12} /> toward {deg(snap.surfaceCurrent.towardDeg)}
                  {snap.surfaceCurrent.source.kind === 'model' && ` · ${snap.surfaceCurrent.source.label}`}
                </>
              ) : day.currents || day.ocean ? (
                t('noRadar')
              ) : (
                notReady(status.currents)
              )
            }
          />
          <Stat label={t('sunset')} value={snap.sun.sunset ? fmtClock(snap.sun.sunset) : '—'} sub={snap.sun.civilDusk ? `${t('dusk')} ${fmtClock(snap.sun.civilDusk)}` : undefined} />
        </div>
      </Section>

      <Section title={t('deepWater')}>
        {snap.deep.length ? (
          <table className={styles.deepTable}>
            <thead>
              <tr>
                <th scope="col" />
                {snap.deep.map((d) => (
                  <th key={d.code} scope="col">
                    {d.code}
                    <small>{d.depthM ? `${Math.round(d.depthM)} m` : ''}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEEP_ROWS.filter((r) => snap.deep.some((d) => d.v[r.key] !== undefined)).map((r) => (
                <tr key={r.key}>
                  <th scope="row">
                    {r.label} <small>{r.unit}</small>
                  </th>
                  {snap.deep.map((d) => (
                    <td key={d.code}>{num(d.v[r.key], r.digits)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty text={notReady(status.stations)} />
        )}
      </Section>

      <Section title={t('depthCurrents')}>
        {day.profiles?.nodes.length ? (
          <div className={styles.depthPair}>
            {day.profiles.nodes.map((n) => (
              <figure key={n.code}>
                <figcaption>{n.code}</figcaption>
                <DepthProfile axis={day.profiles!.axis} node={n} t={snap.t} surface={snap.surfaceCurrent} />
              </figure>
            ))}
          </div>
        ) : (
          <Empty text={notReady(status.profiles)} />
        )}
      </Section>

      <Section title={t('twdp')}>
        {snap.twdp ? (
          <>
            <div className={styles.triple}>
              <Stat label={t('sog')} value={num(snap.twdp.sogKn)} unit="kn" />
              <Stat label="Sea temp" value={num(snap.twdp.sstC)} unit="°C" sub={snap.ship ? `own ${num(snap.ship.water.sstC.now)}` : undefined} />
              <Stat label="Salinity" value={num(snap.twdp.sal)} unit="psu" sub={snap.ship ? `own ${num(snap.ship.water.sal.now)}` : undefined} />
            </div>
            <div className={styles.triple}>
              <Stat label="O₂ sat" value={num(snap.twdp.o2Sat, 0)} unit="%" />
              <Stat label="Chl" value={num(snap.twdp.chl)} unit="µg/l" />
              <Stat label="Turbidity" value={num(snap.twdp.turb)} unit="NTU" />
            </div>
          </>
        ) : (
          <Empty text={day.stations ? 'Not under way' : notReady(status.stations)} />
        )}
      </Section>

      <Section title={t('traffic')} aside={day.traffic ? `${snap.targets.length} in range` : undefined}>
        {mode === 'live' ? (
          <Empty text={t('trafficReplayOnly')} />
        ) : day.traffic ? (
          snap.targets.length ? (
            <ul className={styles.targets}>
              {snap.targets.slice(0, 5).map((x) => (
                <li key={x.v.mmsi} data-danger={x.danger || undefined}>
                  <button type="button" onClick={() => ui.setSelected(x.v.mmsi)} aria-pressed={ui.selected === x.v.mmsi}>
                    <b>
                      {x.danger && '⚠ '}
                      {x.v.name}
                    </b>
                    <span>
                      {num(x.cpa.rangeNm, 1)} nm {compass(x.cpa.bearingDeg)} · CPA {num(x.cpa.cpaNm, 2)} nm
                      {x.cpa.tcpaMin > 0 ? ` in ${num(x.cpa.tcpaMin, 0)} min` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text={t('noTargets')} />
          )
        ) : (
          <Empty text={notReady(status.traffic)} />
        )}
      </Section>
    </aside>
  )
}

/** One height scale for every tide station, so their ranges compare. */
function tideDomain(series: Float32Array[]): [number, number] | null {
  let lo = Infinity
  let hi = -Infinity
  for (const s of series) {
    const [a, b] = extent(s)
    if (a < lo) lo = a
    if (b > hi) hi = b
  }
  return lo < hi ? [lo - 0.1, hi + 0.1] : null
}
