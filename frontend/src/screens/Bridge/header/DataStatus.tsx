import { useBridgeData } from '../../../bridge/BridgeProvider'
import type { PartName, PartStatus } from '../../../bridge/model'
import { t } from '../strings'
import styles from './BridgeHeader.module.css'

const LABELS: Record<PartName, string> = {
  ship: 'Own ship (ONC TWSB)',
  stats: 'Crossing stats',
  profile: 'Route profile (today)',
  climatology: 'August climatology (ONC)',
  tides: 'Tides and currents (DFO)',
  weather: 'Wind and weather, model (Open-Meteo)',
  windobs: 'Wind, measured (Environment Canada)',
  stations: 'ONC observatories and TWDP',
  currents: 'Surface currents, measured (ONC CODAR)',
  ocean: 'Surface currents, model (SalishSeaCast, global)',
  profiles: 'Current profiles (ONC ADCP)',
  traffic: 'Vessel traffic (ONC AIS)',
  sources: 'ONC inventory',
}

const SOURCE_NAMES = { api: 'backend', snapshot: 'offline copy', bundled: 'bundled', live: 'live', sample: 'sample feed (same as the kiosk)' }

function describe(s: PartStatus): string {
  if (s.state === 'loading') return t('loading')
  if (s.state === 'missing') return s.reason
  return SOURCE_NAMES[s.source] + (s.ageS !== undefined ? ` · ${Math.round(s.ageS)} s old` : '')
}

/** Data health: one dot per dataset; open for the details and every ONC source of the day. */
export function DataStatus() {
  const { status, day } = useBridgeData()
  const entries = Object.entries(status) as [PartName, PartStatus][]
  const ready = entries.filter(([, s]) => s.state === 'ready').length
  const used = day.sources?.filter((s) => s.usedBy && s.status === 'ok') ?? []
  const unused = day.sources?.filter((s) => !s.usedBy && s.status === 'ok') ?? []

  return (
    <details className={styles.status}>
      <summary aria-label={`${t('sources')}: ${ready} of ${entries.length} ready`}>
        <span className={styles.dots} aria-hidden="true">
          {entries.map(([name, s]) => (
            <i key={name} data-state={s.state} />
          ))}
        </span>
        {ready}/{entries.length}
      </summary>
      <div className={styles.popover}>
        <h3>{t('sources')}</h3>
        <ul className={styles.statusList}>
          {entries.map(([name, s]) => (
            <li key={name} data-state={s.state}>
              <StateIcon state={s.state} />
              <span>{LABELS[name]}</span>
              <em>{describe(s)}</em>
            </li>
          ))}
        </ul>
        {day.sources && (
          <>
            <h3>ONC sources used today ({used.length})</h3>
            <ul className={styles.sourceList}>
              {used.map((s) => (
                <li key={`${s.location}/${s.category}/${s.kind}`}>
                  <b>{s.location}</b> {s.category} <em>→ {s.usedBy}</em>
                </li>
              ))}
            </ul>
            {unused.length > 0 && (
              <>
                <h3>Also reporting, not shown ({unused.length})</h3>
                <ul className={styles.sourceList}>
                  {unused.map((s) => (
                    <li key={`${s.location}/${s.category}/${s.kind}`}>
                      <b>{s.location}</b> {s.category} <em>{s.kind}</em>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </details>
  )
}

/** Status shape as well as colour: check, dash or ring. */
function StateIcon({ state }: { state: PartStatus['state'] }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      {state === 'ready' && <path d="M3 7.5l2.5 2.5L11 4.5" stroke="var(--b-good)" strokeWidth="2" fill="none" />}
      {state === 'missing' && <path d="M3.5 7h7" stroke="var(--b-warning)" strokeWidth="2" />}
      {state === 'loading' && <circle cx="7" cy="7" r="4" stroke="var(--b-muted)" strokeWidth="1.5" fill="none" />}
    </svg>
  )
}
