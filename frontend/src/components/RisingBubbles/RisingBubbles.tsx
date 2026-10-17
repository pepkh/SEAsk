import { useMemo, type CSSProperties } from 'react'
import styles from './RisingBubbles.module.css'

interface Props {
  count?: number
  /** Different seeds give different (but stable) patterns */
  seed?: number
  /** Largest bubble as a share of the box width */
  maxSize?: number
  /** Seconds for one bubble to rise through the box */
  speed?: number
  className?: string
}

/** Small pseudo-random generator, so a pattern is the same on every render. */
function random(seed: number) {
  let s = seed * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

/** Little air bubbles rising through their box (decoration inside water: the Dive bubble, the transition, the welcome sea). */
export function RisingBubbles({ count = 12, seed = 1, maxSize = 0.06, speed = 6, className = '' }: Props) {
  const bubbles = useMemo(() => {
    const rnd = random(seed)
    return Array.from({ length: count }, () => ({
      '--x': `${(rnd() * 96 + 2).toFixed(1)}%`,
      '--s': `${(maxSize * (0.35 + rnd() * 0.65) * 100).toFixed(2)}cqw`,
      '--d': `${(speed * (0.7 + rnd() * 0.6)).toFixed(2)}s`,
      '--delay': `${(-rnd() * speed * 1.3).toFixed(2)}s`,
      '--wobble': `${(rnd() * 16 - 8).toFixed(1)}px`,
    }) as CSSProperties)
  }, [count, seed, maxSize, speed])

  return (
    <span className={`${styles.box} ${className}`} aria-hidden="true">
      {bubbles.map((style, i) => <i key={i} style={style} />)}
    </span>
  )
}
