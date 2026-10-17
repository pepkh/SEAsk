import type { ButtonHTMLAttributes, CSSProperties, ReactNode, Ref } from 'react'
import styles from './Bubble.module.css'

export type BubbleTone = 'glass' | 'water' | 'accent' | 'live'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Diameter at the 1920 × 1080 design size (px) */
  size: number
  tone?: BubbleTone
  /** Offset of the idle bob (s), so neighbouring bubbles don't move in step */
  bob?: number
  /** Short text under the bubble (part of the same button) */
  caption?: ReactNode
  /** Classes for the round part (e.g. the clipped map inside) */
  orbClassName?: string
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
}

/**
 * A bubble: a round glass button that floats and shines. Only things you can touch are bubbles;
 * information that can't be touched goes on a Card.
 */
export function Bubble({ size, tone = 'glass', bob = 0, caption, orbClassName = '', className = '', style, children, ref, type = 'button', ...rest }: Props) {
  const vars = { '--size': `${size}px`, '--bob': bob, ...style } as CSSProperties
  return (
    <button ref={ref} type={type} className={`${styles.bubble} ${className}`} style={vars} {...rest}>
      <span className={`${styles.orb} ${styles[tone]} ${orbClassName}`}>{children}</span>
      {caption && <span className={styles.caption}>{caption}</span>}
    </button>
  )
}
