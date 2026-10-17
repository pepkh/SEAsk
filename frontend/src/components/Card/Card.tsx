import type { HTMLAttributes, Ref } from 'react'
import styles from './Card.module.css'

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** "deep": the dark version for underwater screens */
  tone?: 'glass' | 'deep'
  ref?: Ref<HTMLDivElement>
}

/** A card: flat and still, for information only. It never reacts to touch (things you can touch are bubbles). */
export function Card({ tone = 'glass', className = '', ref, ...rest }: Props) {
  return <div ref={ref} className={`${styles.card} ${styles[tone]} ${className}`} {...rest} />
}
