import type { ReactNode } from 'react'
import styles from './Rail.module.css'

/** A titled block of a rail. */
export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <header>
        <h2>{title}</h2>
        {aside && <span className={styles.aside}>{aside}</span>}
      </header>
      {children}
    </section>
  )
}

/** One reading: label, value and unit, and an optional line under it. */
export function Stat({ label, value, unit, sub, size = 'md', tone }: { label: string; value: string; unit?: string; sub?: ReactNode; size?: 'lg' | 'md' | 'sm'; tone?: 'critical' | 'warning' }) {
  return (
    <div className={`${styles.stat} ${styles[size]}`} data-tone={tone}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>
        {value}
        {unit && value !== '—' && <small>{unit}</small>}
      </span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  )
}

/** Shown in place of a block whose dataset is missing or still loading. */
export function Empty({ text }: { text: string }) {
  return <p className={styles.empty}>{text}</p>
}

/** Small arrow pointing the way something moves (degrees true, 0 = up). */
export function Arrow({ toward, size = 16 }: { toward: number; size?: number }) {
  if (!Number.isFinite(toward)) return null
  return (
    <svg width={size} height={size} viewBox="-8 -8 16 16" aria-hidden="true" className={styles.arrow}>
      <path d="M0 -7 L4.5 5 L0 2.5 L-4.5 5 Z" transform={`rotate(${toward})`} fill="currentColor" />
    </svg>
  )
}
