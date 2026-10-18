import type { ProfileNode } from '../../../bridge/model'
import { framePair } from '../../../bridge/field'
import type { Axis } from '../../../bridge/series'
import styles from './charts.module.css'

const W = 170
const H = 150
const KN = 3600 / 1852

/**
 * Current through the water column at one ADCP: one arrow per depth bin (direction and speed), surface
 * at the top, with the CODAR surface value as a hollow arrow above for comparison.
 */
export function DepthProfile({ axis, node, t, surface }: { axis: Axis; node: ProfileNode; t: number; surface: { kn: number; towardDeg: number } | null }) {
  const p = framePair(axis, t)
  const bins = node.binDepthM
  const maxDepth = Math.max(node.depthM, ...bins)
  const y = (d: number) => 22 + (d / maxDepth) * (H - 30)
  const rows = bins.map((d, b) => {
    if (!p) return null
    const lerp = (a: number, c: number) => (Number.isFinite(a) && Number.isFinite(c) ? a + (c - a) * p[2] : a)
    const u = lerp(node.u[p[0]][b], node.u[p[1]][b])
    const v = lerp(node.v[p[0]][b], node.v[p[1]][b])
    if (!Number.isFinite(u) || !Number.isFinite(v)) return null
    return { d, kn: Math.hypot(u, v) * KN, toward: ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360 }
  })
  const shown = rows.filter((r, i) => r && i % Math.max(1, Math.ceil(bins.length / 12)) === 0)
  const maxKn = Math.max(0.5, ...shown.map((r) => r!.kn), surface?.kn ?? 0)

  return (
    <svg className={styles.depth} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${node.code} currents by depth`}>
      <line x1={36} x2={36} y1={18} y2={H - 6} className={styles.zero} />
      {[0, Math.round(maxDepth / 2), Math.round(maxDepth)].map((d) => (
        <text key={d} x={30} y={y(d) + 3} textAnchor="end" className={styles.tick}>
          {d} m
        </text>
      ))}
      {surface && (
        <g transform={`translate(${44 + (surface.kn / maxKn) * 50},${10}) rotate(${surface.towardDeg})`}>
          <path d="M0 -6 L4 5 L0 3 L-4 5 Z" className={styles.surfaceArrow} />
        </g>
      )}
      {shown.map((r) => {
        const len = 6 + (r!.kn / maxKn) * 10
        return (
          <g key={r!.d} transform={`translate(${44 + (r!.kn / maxKn) * 50},${y(r!.d)}) rotate(${r!.toward})`}>
            <path d={`M0 ${-len / 2} L${len * 0.3} ${len / 2} L0 ${len * 0.3} L${-len * 0.3} ${len / 2} Z`} className={styles.depthArrow} />
          </g>
        )
      })}
      <text x={W - 4} y={H - 4} textAnchor="end" className={styles.tick}>
        max {maxKn.toFixed(1)} kn
      </text>
    </svg>
  )
}
