import { ISLAND_PATHS, svgRoute } from '../../../components/RouteMap/geometry'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { Sailing } from '../../../types/sailing'
import styles from './MiniRouteMap.module.css'

/** "Your route" card: islands, the route split at the ship, and the ship marker. */
export function MiniRouteMap({ sailing, place }: { sailing: Sailing; place: string }) {
  const { t } = useLanguage()
  const route = svgRoute(sailing.fraction, sailing.direction)
  const [x, y] = route.ship

  return (
    <div className={styles.mini}>
      <span className={styles.cap}>{t('journey.yourRoute')}</span>
      <svg viewBox="0 0 1360 968" preserveAspectRatio="xMidYMid slice" role="img" aria-label={t('journey.routeMapLabel', { place })}>
        <rect width="1360" height="968" fill="#CBDDE6" />
        <g fill="#F5F7F7" stroke="#AEB9BE" strokeWidth="3">
          {ISLAND_PATHS.map((d) => <path key={d} d={d} />)}
        </g>
        <path d={route.remaining} fill="none" stroke="#5E7480" strokeWidth="10" strokeDasharray="4 22" strokeLinecap="round" />
        <path d={route.travelled} fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x} cy={y} r="70" style={{ fill: 'var(--accent)' }} opacity=".18" />
        <circle cx={x} cy={y} r="26" fill="#fff" style={{ stroke: 'var(--accent)' }} strokeWidth="12" />
      </svg>
    </div>
  )
}
