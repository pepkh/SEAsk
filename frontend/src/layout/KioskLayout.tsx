import { Outlet } from 'react-router'
import { Dock } from '../components/Dock/Dock'
import { useUiScale } from '../hooks/useUiScale'
import styles from './KioskLayout.module.css'

/** Screen area on top, dock at the bottom (112 px at full scale). */
export function KioskLayout() {
  useUiScale()
  return (
    <div className={styles.app}>
      <main className={styles.main}>
        <Outlet />
      </main>
      <Dock />
    </div>
  )
}
