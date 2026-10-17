import { useLanguage } from '../../i18n/LanguageContext'
import { depthAt, floorY, SLICE_PROFILE, SLICE_WIDTH, sliceX, SURFACE_Y } from '../../ship/slice'
import type { SeafloorContent } from '../../types/content'
import type { Sailing } from '../../types/sailing'
import styles from './SliceView.module.css'

const SHADOW_ROOM = 40
const profile = SLICE_PROFILE.map(([x, y]) => `${x} ${y}`).join(' L')

/** Cross-section of the sea along the route. The ship and the depth probe follow the route fraction. */
export function SliceView({ content, sailing, place }: { content: SeafloorContent; sailing: Sailing; place: string }) {
  const { t } = useLanguage()
  const x = sliceX(sailing.fraction)
  const floor = floorY(x)
  const [start, end] = sailing.direction === 1 ? [24, SLICE_WIDTH] : [SLICE_WIDTH, 24]

  return (
    <div className={styles.panel}>
      <svg viewBox="0 0 1848 600" role="img" aria-label={t('seafloor.sliceLabel')}>
        <defs>
          <linearGradient id="waterG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2E7EA6" />
            <stop offset="0.45" stopColor="#155271" />
            <stop offset="1" stopColor="#071E2B" />
          </linearGradient>
          <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8E7A5E" />
            <stop offset="1" stopColor="#3A3127" />
          </linearGradient>
          <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#CFE1EA" />
            <stop offset="1" stopColor="#E9F1F4" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="1848" height="70" fill="url(#skyG)" />
        <rect x="0" y="70" width="1848" height="530" fill="url(#waterG)" />
        <line x1="0" y1="330" x2="1848" y2="330" stroke="#FFFFFF" strokeOpacity="0.22" strokeDasharray="6 10" />
        <g fontFamily="Outfit, sans-serif" textAnchor="end">
          <text x="1830" y="106" fontSize="18" fontWeight="600" fill="#FFFFFF" opacity="0.85">{t('seafloor.sunlight')}</text>
          <text x="1830" y="128" fontSize="15" fill="#DDEAF0" opacity="0.75">{t('seafloor.sunlightSub')}</text>
          <text x="1830" y="360" fontSize="18" fontWeight="600" fill="#FFFFFF" opacity="0.8">{t('seafloor.twilight')}</text>
          <text x="1830" y="382" fontSize="15" fill="#DDEAF0" opacity="0.7">{t('seafloor.twilightSub')}</text>
        </g>
        <g fontFamily="JetBrains Mono, monospace" fontSize="13" fill="#BFD3DC" opacity="0.7">
          <text x="10" y="135">50 m</text>
          <text x="10" y="200">100 m</text>
          <text x="10" y="330">200 m</text>
          <text x="10" y="460">300 m</text>
        </g>
        <path d={`M${profile} L1850 600 L24 600 Z`} fill="url(#floorG)" />
        <path d={`M${profile}`} fill="none" stroke="#C9B38E" strokeWidth="3" />
        <rect x="0" y="40" width="40" height="30" fill="#8C9A7A" />
        <rect x="1808" y="44" width="40" height="26" fill="#8C9A7A" />
        <path d={`M${start} ${SURFACE_Y} L${x} ${SURFACE_Y}`} style={{ stroke: 'var(--accent)' }} strokeWidth="5" strokeLinecap="round" />
        <path d={`M${x} ${SURFACE_Y} L${end} ${SURFACE_Y}`} stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="3" strokeDasharray="3 9" strokeLinecap="round" />
        <line x1={x} y1="82" x2={x} y2={floor - 5} stroke="#FFFFFF" strokeWidth="2" strokeDasharray="4 6" />
        <circle cx={x} cy={floor} r="7" fill="#FFFFFF" />
        <g transform={`translate(${x - 40} 46)`}>
          <path d="M0 18 L80 18 Q76 28 66 30 L14 30 Q4 28 0 18 Z" fill="#0F3B3A" />
          <rect x="12" y="8" width="56" height="10" rx="5" fill="#F1F4F5" />
          <rect x="22" y="2" width="36" height="7" rx="3.5" fill="#F1F4F5" />
          <rect x="37" y="-6" width="6" height="9" rx="2" fill="#F1F4F5" />
        </g>
        <g fontFamily="Outfit, sans-serif">
          <text x="24" y="30" fontSize="17" fontWeight="600" fill="#15191C">{t('waypoint.swartzBay')}</text>
          <text x={x} y="30" textAnchor="middle" fontSize="17" fontWeight="700" fill="#15191C">{t('seafloor.you', { place })}</text>
          <text x="1824" y="30" textAnchor="end" fontSize="17" fontWeight="600" fill="#15191C">{t('waypoint.tsawwassen')}</text>
          {content.places.map((p) => (
            <text key={p.label} x={p.x} y="58" textAnchor="middle" fontSize="15" fill="#3C464B">{p.label}</text>
          ))}
        </g>
        <path d="M1560 70 Q1700 70 1848 70 L1848 112 Q1720 98 1560 70 Z" fill="#B59A6A" opacity="0.28" />
        <g fontFamily="Outfit, sans-serif" fontSize="15" fill="#FFFFFF">
          {content.markers.map((m) => (
            <g key={m.label}>
              <circle cx={m.cx} cy={m.cy} r="16" fill="#E2553A" />
              <text x={m.tx} y={m.ty}>{m.label}</text>
            </g>
          ))}
        </g>
        {/* The box is larger than the callout so its shadow is not clipped (margin = SHADOW_ROOM). */}
        <foreignObject x={x + 31 - SHADOW_ROOM} y={108 - SHADOW_ROOM} width={300 + 2 * SHADOW_ROOM} height={100 + 2 * SHADOW_ROOM}>
          <div className={styles.callout} style={{ margin: SHADOW_ROOM }}>
            <span className={styles.calloutLabel}>{t('seafloor.waterBelow')}</span>
            <span className={styles.calloutValue}>{depthAt(sailing.fraction)} m</span>
          </div>
        </foreignObject>
      </svg>
      <span className={styles.footnote}>{t('seafloor.footnote')}</span>
    </div>
  )
}
