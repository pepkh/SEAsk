import { useBridgeUi, useSnapshot } from '../../../bridge/BridgeProvider'
import { compass, deg, num } from '../strings'
import styles from './BridgeMap.module.css'

const GROUP_NAMES: Record<string, string> = {
  passenger: 'Passenger', cargo: 'Cargo', tanker: 'Tanker', tug: 'Tug', fishing: 'Fishing', pleasure: 'Pleasure craft',
  sailing: 'Sailing', hsc: 'High-speed craft', special: 'Special craft', other: 'Other', unknown: 'Unknown type',
}

/** Card for the vessel tapped on the map: identity, motion, and CPA/TCPA from own ship. */
export function VesselCallout() {
  const ui = useBridgeUi()
  const snap = useSnapshot()
  const target = ui.selected ? snap.targets.find((x) => x.v.mmsi === ui.selected) : null
  if (!target) return null
  const { v, cpa } = target

  return (
    <aside className={styles.callout} aria-live="polite">
      <header>
        <b>{v.name}</b>
        <button type="button" onClick={() => ui.setSelected(null)} aria-label="Close">
          ×
        </button>
      </header>
      <p className={styles.calloutSub}>
        {GROUP_NAMES[v.group]}
        {v.lengthM ? ` · ${Math.round(v.lengthM)} m` : ''} · MMSI {v.mmsi}
        {target.stale ? ' · last fix old' : ''}
      </p>
      <dl>
        <dt>SOG</dt>
        <dd>{num(target.sogKn)} kn</dd>
        <dt>COG</dt>
        <dd>{deg(target.cogDeg)}</dd>
        <dt>Range</dt>
        <dd>
          {num(cpa.rangeNm, 2)} nm · {compass(cpa.bearingDeg)}
        </dd>
        <dt>CPA</dt>
        <dd className={target.danger ? styles.danger : undefined}>
          {target.danger && '⚠ '}
          {num(cpa.cpaNm, 2)} nm
        </dd>
        <dt>TCPA</dt>
        <dd>{cpa.tcpaMin > 0 ? `${num(cpa.tcpaMin, 0)} min` : 'passed'}</dd>
      </dl>
    </aside>
  )
}
