import styles from './PhotoPlaceholder.module.css'

/** Grey box with the "[photo: …]" text until real photos are added. */
export function PhotoPlaceholder({ label, className = '' }: { label: string; className?: string }) {
  return <div className={`${styles.photo} ${className}`}>{label}</div>
}
