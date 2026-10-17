import { NavLink, useLocation } from 'react-router'
import { useClock } from '../../hooks/useClock'
import { compassPoint, formatTime } from '../../i18n/format'
import { useLanguage, type TKey } from '../../i18n/LanguageContext'
import { useShip } from '../../ship/ShipProvider'
import { useWeather } from '../../weather/WeatherProvider'
import styles from './Dock.module.css'
import { JourneyIcon, QuizIcon, SeafloorIcon, SeaLifeIcon, TidesIcon } from './dockIcons'

const TABS: { to: string; label: TKey; Icon: () => React.JSX.Element }[] = [
  { to: '/journey', label: 'dock.journey', Icon: JourneyIcon },
  { to: '/sea-life', label: 'dock.seaLife', Icon: SeaLifeIcon },
  { to: '/seafloor', label: 'dock.seafloor', Icon: SeafloorIcon },
  { to: '/tides', label: 'dock.tides', Icon: TidesIcon },
  { to: '/quiz', label: 'dock.quiz', Icon: QuizIcon },
]

export function Dock() {
  const { t, lang } = useLanguage()
  const now = useClock()
  const weather = useWeather()
  const ship = useShip()
  const onJourney = useLocation().pathname.startsWith('/journey')

  // Journey shows the wind; the other tabs show the arrival.
  let fact = ''
  if (onJourney) {
    fact = t('dock.wind', { kn: Math.round(weather.wind.kn), dir: compassPoint(weather.wind.fromDeg, t('compass')) })
  } else if (!onJourney && ship) {
    const { sailing } = ship
    fact = sailing.etaMin === null
      ? t('dock.next', { place: sailing.to.name })
      : t('dock.eta', { place: sailing.to.name, min: sailing.etaMin })
  }

  return (
    <nav className={styles.dock} aria-label={t('dock.label')}>
      {TABS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to}>
          <Icon />
          <span>{t(label)}</span>
        </NavLink>
      ))}
      <span className={styles.spacer} />
      <div className={styles.meta}>
        <span>{fact}</span>
        <i />
        <b>{formatTime(now, lang)}</b>
      </div>
    </nav>
  )
}
