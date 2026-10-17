import { Card } from '../../components/Card/Card'
import { useLanguage } from '../../i18n/LanguageContext'
import { depthAt } from '../../ship/slice'
import type { Band } from './bands'
import styles from './DepthGauge.module.css'

/** Column drawing (px of the SVG view box) */
const TOP = 46
const BOTTOM = 470
const COL_X = 34
const COL_W = 120

/**
 * The water under the ship right now, as a column from the ferry down to the seafloor, split into the same three
 * bands as the animals. The band of the animal being looked at lights up. A card: information only.
 */
export function DepthGauge({ fraction, highlight }: { fraction: number; highlight: Band | null }) {
  const { t } = useLanguage()
  const m = depthAt(fraction)
  // Band edges as a share of the column: the sunlit top ~20 m, the last ~15 m above the floor.
  const surfaceEnd = Math.min(20 / Math.max(m, 1), 0.3)
  const floorStart = Math.max((m - 15) / Math.max(m, 1), 0.75)
  const y = (share: number) => TOP + share * (BOTTOM - TOP)
  const bands: { band: Band; from: number; to: number }[] = [
    { band: 'surface', from: 0, to: surfaceEnd },
    { band: 'open', from: surfaceEnd, to: floorStart },
    { band: 'floor', from: floorStart, to: 1 },
  ]

  return (
    <Card className={styles.gauge}>
      <span className={styles.eyebrow}>{t('dive.gauge.title')}</span>
      <b className={styles.depth}>{t('dive.gauge.depth', { m })}</b>
      <svg viewBox="0 0 360 520" className={styles.column} role="img" aria-label={t('dive.gauge.label', { m })}>
        <defs>
          <linearGradient id="gaugeWater" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7FC4D8" />
            <stop offset="0.5" stopColor="#2E7F9E" />
            <stop offset="1" stopColor="#0D3446" />
          </linearGradient>
        </defs>
        <rect x={COL_X} y={TOP} width={COL_W} height={BOTTOM - TOP} rx="18" fill="url(#gaugeWater)" />
        {bands.map(({ band, from, to }) => (
          <g key={band} className={`${styles.band} ${highlight === band ? styles.on : ''}`}>
            <rect x={COL_X - 6} y={y(from) + 2} width={COL_W + 12} height={Math.max(4, y(to) - y(from) - 4)} rx="14" />
            <text x={COL_X + COL_W + 22} y={(y(from) + y(to)) / 2 + 7}>{t(`dive.bands.${band}`)}</text>
          </g>
        ))}
        {/* The ferry on the surface, and the seafloor */}
        <path d={`M${COL_X + 18} ${TOP - 6} h84 l-10 14 h-64 z`} fill="#15191C" />
        <rect x={COL_X + 44} y={TOP - 22} width="32" height="16" rx="3" fill="#fff" stroke="#15191C" strokeWidth="3" />
        <path d={`M${COL_X} ${BOTTOM - 18} q30 -14 60 -4 t60 -2 V${BOTTOM} H${COL_X} z`} fill="#c9b58a" />
        <line x1={COL_X + COL_W / 2} y1={TOP + 12} x2={COL_X + COL_W / 2} y2={BOTTOM - 24} stroke="#fff" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" opacity=".8" />
      </svg>
    </Card>
  )
}
