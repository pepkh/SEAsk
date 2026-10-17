import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

interface Props {
  title: string
  subtitle: ReactNode
  /** Controls on the right (toggles, filters) */
  children?: ReactNode
  /** Sea life uses a tighter header (gap 4 px, centred controls) */
  compact?: boolean
}

export function PageHeader({ title, subtitle, children, compact = false }: Props) {
  return (
    <div className={`${styles.header} ${compact ? styles.compact : ''}`}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        <span className={styles.subtitle}>{subtitle}</span>
      </div>
      {children}
    </div>
  )
}
