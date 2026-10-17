import { sample } from './trackColour'

const W = 120
const H = 28
const PAD = 2
const POINTS = 30

/** Small trend line (120 × 28). Each series fills the box height. */
export function Sparkline({ values }: { values: (number | null)[] }) {
  const data = sample(values.filter((v): v is number => v !== null), POINTS)
  const min = Math.min(...data)
  const max = Math.max(...data)
  const points = data
    .map((v, i) => {
      const x = data.length > 1 ? (i * W) / (data.length - 1) : 0
      const y = max > min ? PAD + ((max - v) / (max - min)) * (H - 2 * PAD) : H / 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      {data.length > 1 && (
        <polyline points={points} fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      )}
    </svg>
  )
}
