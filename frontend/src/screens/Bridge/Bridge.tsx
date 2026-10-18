import './bridgeTheme.css'
import { BridgeProvider, useBridgeUi } from '../../bridge/BridgeProvider'
import { BRIDGE_DATE, BRIDGE_MODE } from '../../config/env'
import { useUiScale } from '../../hooks/useUiScale'
import { AskPanel } from './ask/AskPanel'
import styles from './Bridge.module.css'
import { BridgeHeader } from './header/BridgeHeader'
import { BridgeMap } from './map/BridgeMap'
import { ConditionsRail } from './rails/ConditionsRail'
import { OwnShipRail } from './rails/OwnShipRail'
import { Timeline } from './timeline/Timeline'

/**
 * Captain's bridge screen (/bridge): every dataset about one day on one screen, Windy-style.
 * Own ship on the left, the map in the middle, outside conditions on the right, and a timeline to
 * scrub or play the day. Outside the passenger kiosk shell: no session, guide or idle prompt.
 */
export default function Bridge() {
  useUiScale()
  return (
    <BridgeProvider date={BRIDGE_DATE} mode={modeFromAddress() ?? BRIDGE_MODE}>
      <Shell />
    </BridgeProvider>
  )
}

/** `?mode=live` or `?mode=replay` in the address. */
function modeFromAddress(): 'live' | 'replay' | null {
  const mode = new URLSearchParams(window.location.search).get('mode')
  return mode === 'live' || mode === 'replay' ? mode : null
}

function Shell() {
  const { night } = useBridgeUi()
  return (
    <div className={`bridge ${styles.root}`} data-night={night ? '' : undefined}>
      <BridgeHeader className={styles.header} />
      <OwnShipRail className={styles.left} />
      <BridgeMap className={styles.map} />
      <ConditionsRail className={styles.right} />
      <Timeline className={styles.timeline} />
      <AskPanel className={styles.ask} />
    </div>
  )
}
