import { useBridgeData, useSnapshot } from '../../../bridge/BridgeProvider'
import type { WaterKey, WaterReading } from '../../../bridge/snapshot'
import { fmtClock, fmtDuration } from '../../../bridge/time'
import { deg, num, t, ZONE_NAMES } from '../strings'
import { Compass } from './Compass'
import { Arrow, Empty, Section, Stat } from './parts'
import styles from './Rail.module.css'

const WATER_ROWS: { key: WaterKey; label: string; unit: string; digits: number }[] = [
  { key: 'sstC', label: 'Sea temp', unit: '°C', digits: 1 },
  { key: 'sal', label: 'Salinity', unit: 'psu', digits: 1 },
  { key: 'o2Sat', label: 'O₂ sat', unit: '%', digits: 0 },
  { key: 'chl', label: 'Chlorophyll', unit: 'µg/l', digits: 1 },
  { key: 'turb', label: 'Turbidity', unit: 'NTU', digits: 1 },
]

const QC: { label: string; key: WaterKey }[] = [
  { label: 'TSG (temp, salinity)', key: 'sstC' },
  { label: 'Oxygen optode', key: 'o2Sat' },
  { label: 'Fluorometer (chl, turbidity)', key: 'chl' },
]

const COMFORT: Record<string, string> = { calm: 'Calm', gentle: 'Gentle roll', rolly: 'Rolly' }

/** Left rail: everything about our own ferry at the playhead. */
export function OwnShipRail({ className }: { className: string }) {
  const snap = useSnapshot()
  const { status, day, mode } = useBridgeData()
  const ship = snap.ship

  if (!ship) {
    return (
      <aside className={`${styles.rail} ${className}`} aria-label={t('ownShip')}>
        <Section title={t('ownShip')}>
          <Empty text={status.ship.state === 'loading' ? t('loading') : t('missing')} />
        </Section>
      </aside>
    )
  }

  const crossing = ship.crossing
  const from = crossing?.direction === 'tsa_to_swb' ? 'Tsawwassen' : 'Swartz Bay'
  const to = crossing?.direction === 'tsa_to_swb' ? 'Swartz Bay' : 'Tsawwassen'
  const climYears = day.climatology?.years
  const usualCaption = Object.values(ship.water).some((w) => w.usualFrom === 'climatology') && climYears?.length
    ? t('usualFromClimatology', { years: `${climYears[0]}–${climYears[climYears.length - 1]}` })
    : t('usualFromToday')

  return (
    <aside className={`${styles.rail} ${className}`} aria-label={t('ownShip')}>
      <Section title={t('nav')}>
        <div className={styles.navRow}>
          <div className={styles.navStats}>
            <Stat label={t('sog')} value={num(ship.sogKn)} unit="kn" size="lg" />
            <div className={styles.pair}>
              <Stat label={t('cog')} value={deg(ship.cogDeg)} />
              <Stat label={t('hdg')} value={deg(ship.hdgDeg)} />
            </div>
          </div>
          <Compass hdg={ship.hdgDeg} cog={ship.cogDeg} />
        </div>
        <p className={styles.position}>
          {num(ship.lat, 4)}° N · {num(Math.abs(ship.lon), 4)}° W
        </p>
      </Section>

      <Section title={t('voyage')} aside={ship.zone ? ZONE_NAMES[ship.zone] : undefined}>
        {crossing ? (
          <>
            <p className={styles.leg}>
              <b>{t('crossing', { id: crossing.id })}</b> {from} → {to}
            </p>
            <div className={styles.progress} role="progressbar" aria-valuenow={Math.round((ship.progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={t('progress')}>
              <i style={{ width: `${(ship.progress ?? 0) * 100}%` }} />
            </div>
            <div className={styles.pair}>
              <Stat label={t('eta')} value={ship.eta ? fmtClock(ship.eta) : '—'} sub={ship.eta ? `in ${fmtDuration(ship.eta - snap.t)}` : undefined} />
              <Stat label="Departed" value={fmtClock(crossing.start)} sub={Number.isFinite(crossing.end) ? `actual arr. ${fmtClock(crossing.end)}` : 'under way'} />
            </div>
          </>
        ) : (
          <>
            <p className={styles.leg}>
              <b>
                {ship.berth
                  ? t('atBerth', { place: ship.berth === 'tsawwassen' ? 'Tsawwassen' : 'Swartz Bay' })
                  : `${t('underWay')} · ${ZONE_NAMES[ship.zone ?? ''] ?? '—'}`}
              </b>
            </p>
            {ship.nextDeparture ? (
              <p className={styles.muted}>
                {t('nextDeparture', { time: fmtClock(ship.nextDeparture.start) })} · in {fmtDuration(ship.nextDeparture.start - snap.t)}
              </p>
            ) : (
              // Live has no sailing schedule: say nothing rather than "no more sailings".
              mode === 'replay' && <p className={styles.muted}>{t('noMoreSailings')}</p>
            )}
          </>
        )}
      </Section>

      <Section title={t('motion')} aside={ship.comfort ? COMFORT[ship.comfort] : undefined}>
        <div className={styles.triple}>
          <Stat label={t('roll')} value={num(ship.rollDeg)} unit="°" />
          <Stat label={t('rollStd')} value={num(ship.rollStd, 2)} unit="°" />
          <Stat label={t('heave')} value={num(ship.heaveM, 2)} unit="m" />
        </div>
      </Section>

      <Section title={t('water')} aside={`${t('usualHere')}: ${usualCaption}`}>
        <table className={styles.waterTable}>
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">now</th>
              <th scope="col">usual</th>
              <th scope="col">Δ</th>
            </tr>
          </thead>
          <tbody>
            {WATER_ROWS.map((row) => (
              <WaterRow key={row.key} row={row} w={ship.water[row.key]} />
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={t('air')}>
        <div className={styles.pair}>
          <Stat label={t('airTemp')} value={num(ship.airC)} unit="°C" />
          <Stat
            label={t('baro')}
            value={num(ship.baroHpa)}
            unit="hPa"
            sub={
              ship.baro ? (
                <>
                  <Arrow toward={ship.baro.rising ? 0 : 180} size={12} /> {ship.baro.label} ({ship.baro.delta > 0 ? '+' : ''}
                  {num(ship.baro.delta)} / 3 h)
                </>
              ) : (
                'trend after 3 h of data'
              )
            }
          />
        </div>
      </Section>

      <Section title={t('sensorQc')}>
        <ul className={styles.qc}>
          {QC.map((q) => (
            <QcRow key={q.key} label={q.label} flag={ship.water[q.key].flag} />
          ))}
        </ul>
      </Section>
    </aside>
  )
}

function WaterRow({ row, w }: { row: (typeof WATER_ROWS)[number]; w: WaterReading }) {
  const delta = w.now - w.usual
  const outside = Number.isFinite(w.p10) && Number.isFinite(w.now) && (w.now < w.p10 || w.now > w.p90)
  return (
    <tr>
      <th scope="row">
        {row.label} <small>{row.unit}</small>
      </th>
      <td className={styles.now}>{num(w.now, row.digits)}</td>
      <td>
        {num(w.usual, row.digits)}
        {Number.isFinite(w.p10) && (
          <small className={styles.band}>
            {num(w.p10, row.digits)}–{num(w.p90, row.digits)}
          </small>
        )}
      </td>
      <td data-outside={outside || undefined}>
        {Number.isFinite(delta) ? `${delta > 0 ? '+' : ''}${num(delta, row.digits)}` : '—'}
        {outside && <span className={styles.flagMark} title="Outside the usual 10–90% range">!</span>}
      </td>
    </tr>
  )
}

function QcRow({ label, flag }: { label: string; flag: number }) {
  const state = flag === 1 ? 'good' : flag === 3 ? 'suspect' : flag === 4 ? 'bad' : 'missing'
  const text = { good: t('qcGood'), suspect: t('qcSuspect'), bad: t('qcBad'), missing: t('qcMissing') }[state]
  return (
    <li data-state={state}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {state === 'good' && <path d="M3 7.5l2.5 2.5L11 4.5" stroke="var(--b-good)" strokeWidth="2" fill="none" />}
        {state === 'suspect' && <path d="M7 2 L12.5 12 H1.5 Z" fill="none" stroke="var(--b-warning)" strokeWidth="1.5" />}
        {state === 'bad' && <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="var(--b-serious)" strokeWidth="2" />}
        {state === 'missing' && <path d="M3.5 7h7" stroke="var(--b-muted)" strokeWidth="2" />}
      </svg>
      <span>{label}</span>
      <em>{text}</em>
    </li>
  )
}
