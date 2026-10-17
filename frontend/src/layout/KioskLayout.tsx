import { Outlet } from 'react-router'
import { Dock } from '../components/Dock/Dock'
import styles from './KioskLayout.module.css'

/** Screen area on top, dock at the bottom (112 px). */
export function KioskLayout() {
  return (
    <div className={styles.app}>
      <main className={styles.main}>
        <Outlet />
      </main>
      <Dock />
    </div>
  )
}
