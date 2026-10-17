import { ISLAND_PATHS, svgRoute, SWARTZ_BAY_PT, TSAWWASSEN_PT } from '../../../components/RouteMap/geometry'
import { formatLatLon } from '../../../i18n/format'
import { useLanguage, type Lang } from '../../../i18n/LanguageContext'
import type { TrackMeta } from '../../../types/content'
import type { ShipRow } from '../../../types/feed'
import type { Sailing } from '../../../types/sailing'
import { rampColor, sample } from './trackColour'

/** Grid labels have two decimals, for example "48.95° N". */
const gridLabel = (v: number, axis: 'lat' | 'lon', lang: Lang) => formatLatLon(v, axis, lang, 2)

interface Props {
  row: ShipRow
  sailing: Sailing
  /** Rows of the current crossing (they colour the travelled track) */
  crossing: ShipRow[]
  track: TrackMeta
}

/** Grown-ups route map (SVG). The travelled track has a gradient of the selected reading. */
export function TrackMap({ row, sailing, crossing, track }: Props) {
  const { t, lang } = useLanguage()
  const route = svgRoute(sailing.fraction, sailing.direction)
  const values = sample(crossing.map((r) => r[track.key]).filter((v): v is number => v !== null), 6)
  const [sx, sy] = route.ship

  return (
    <svg
      viewBox="0 0 1320 968"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      role="img"
      aria-label={t('journey.trackMapLabel', { reading: track.label })}
    >
      <defs>
        <linearGradient id="trackG" gradientUnits="userSpaceOnUse" x1={route.from[0]} y1={route.from[1]} x2={sx} y2={sy}>
          {values.map((v, i) => (
            <stop key={i} offset={values.length > 1 ? i / (values.length - 1) : 0} stopColor={rampColor(v, track)} />
          ))}
        </linearGradient>
      </defs>
      <rect width="1320" height="968" fill="#CBDDE6" />
      <g fill="none" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="1.5">
        <ellipse cx="900" cy="330" rx="380" ry="200" />
        <ellipse cx="910" cy="330" rx="270" ry="135" />
        <ellipse cx="925" cy="325" rx="160" ry="75" />
      </g>
      <g fill="#F5F7F7" stroke="#AEB9BE" strokeWidth="2">
        {ISLAND_PATHS.map((d) => <path key={d} d={d} />)}
      </g>
      <g fontFamily="JetBrains Mono, monospace" fontSize="13" fill="#5E7480">
        <text x="20" y="300">{gridLabel(48.95, 'lat', lang)}</text>
        <text x="20" y="620">{gridLabel(48.8, 'lat', lang)}</text>
        <text x="560" y="958">{gridLabel(-123.4, 'lon', lang)}</text>
        <text x="1000" y="958">{gridLabel(-123.2, 'lon', lang)}</text>
      </g>
      <g stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1">
        <line x1="0" y1="295" x2="1320" y2="295" />
        <line x1="0" y1="615" x2="1320" y2="615" />
        <line x1="590" y1="0" x2="590" y2="968" />
        <line x1="1030" y1="0" x2="1030" y2="968" />
      </g>
      <path d={route.remaining} fill="none" stroke="#5E7480" strokeWidth="4" strokeDasharray="2 12" strokeLinecap="round" />
      {values.length > 0 && (
        <path d={route.travelled} fill="none" stroke="url(#trackG)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {[SWARTZ_BAY_PT, TSAWWASSEN_PT].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="9" fill="#FFFFFF" stroke="#15191C" strokeWidth="3" />
      ))}
      <g transform={`translate(${sx} ${sy}) rotate(${row.ship_course})`}>
        <path d="M0 -22 L13 14 L0 7 L-13 14 Z" fill="#15191C" stroke="#FFFFFF" strokeWidth="3" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
