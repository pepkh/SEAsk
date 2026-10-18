import styles from './Rail.module.css'

/** A small compass card: the hull points to the heading, the tick on the rim marks the course over ground. */
export function Compass({ hdg, cog }: { hdg: number; cog: number }) {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10)
  return (
    <svg className={styles.compass} viewBox="-50 -50 100 100" role="img" aria-label={`Heading ${Math.round(hdg)}°, course ${Math.round(cog)}°`}>
      <circle r="46" className={styles.compassRim} />
      {ticks.map((d) => (
        <line key={d} y1={-46} y2={d % 90 === 0 ? -38 : -42} transform={`rotate(${d})`} className={styles.compassTick} />
      ))}
      {['N', 'E', 'S', 'W'].map((p, i) => (
        <text key={p} x={Math.sin((i * Math.PI) / 2) * 30} y={-Math.cos((i * Math.PI) / 2) * 30} textAnchor="middle" dominantBaseline="central" className={styles.compassLetter}>
          {p}
        </text>
      ))}
      {Number.isFinite(cog) && <path d="M0 -46 L5 -36 L-5 -36 Z" transform={`rotate(${cog})`} className={styles.compassCog} />}
      {Number.isFinite(hdg) && (
        <path d="M0 -22 L6 -12 L6 18 L-6 18 L-6 -12 Z" transform={`rotate(${hdg})`} className={styles.compassHull} />
      )}
    </svg>
  )
}
