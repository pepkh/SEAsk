import { KnowledgeIcon } from '../../components/KnowledgeIcon/KnowledgeIcon'
import { Photo } from '../../components/Photo/Photo'
import { useClock } from '../../hooks/useClock'
import { useLanguage, type TKey } from '../../i18n/LanguageContext'
import { comfortOf } from '../../ship/comfort'
import type { ShipState } from '../../ship/ShipProvider'
import { describeTide } from '../../tides/trend'
import { useTides } from '../../tides/useTides'
import type { ZoneText } from '../../types/content'
import type { PlaceKnowledge } from '../../types/landmark'
import { skyOf } from '../../weather/describe'
import { useWeather } from '../../weather/WeatherProvider'
import { WeatherIcon } from '../Lab/outside/WeatherIcon'
import { orderSpecialties, speedLike, tideFill, WATER_WORDS, waterWord, windWord, type WaterKey } from './abstract'
import styles from './slots.module.css'

/** Outside: the sky, the wind in a word, and the tide (a little gauge filled to today's tide level). */
export function OutsideSlot() {
  const { t } = useLanguage()
  const weather = useWeather()
  const tides = useTides()
  const now = useClock()
  const minute = now.getHours() * 60 + now.getMinutes()
  const sky = skyOf(weather.condition.id)
  const tide = tides && describeTide(tides.tides.heights, minute)
  const fill = tides ? tideFill(tides.tides.heights, minute) : 0.5
  const rising = tide ? !['falling', 'low', 'almostLow'].includes(tide.headline) : true

  return (
    <div className={styles.slot}>
      <WeatherIcon sky={sky} night={weather.condition.icon.endsWith('n')} className={styles.icon} />
      <div className={styles.text}>
        <b>{t('now.outside', { temp: Math.round(weather.tempC), wind: t(`now.wind.${windWord(weather.wind.kn)}`) })}</b>
        {tide && <span>{t(`tides.state.${tide.headline}`)}</span>}
      </div>
      <svg viewBox="0 0 48 48" className={styles.gauge} role="img" aria-label={t('now.tideLabel')}>
        <defs>
          <clipPath id="tideClip">
            <circle cx="24" cy="24" r="21" />
          </clipPath>
        </defs>
        <circle cx="24" cy="24" r="21" fill="#eaf4f8" />
        <g clipPath="url(#tideClip)">
          <path d={`M0 ${44 - fill * 40} q6 -3 12 0 t12 0 t12 0 t12 0 V48 H0 Z`} fill="var(--water-surface)" />
        </g>
        <circle cx="24" cy="24" r="21" fill="none" stroke="#9fc3d3" strokeWidth="2" />
        <path d={rising ? 'M24 30 V14 M18 20 l6 -6 6 6' : 'M24 14 V30 M18 24 l6 6 6 -6'} stroke="var(--water-deep)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

const WATER_ICONS: Record<string, React.JSX.Element> = {
  temp: (
    <>
      <path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" />
      <path d="M12 10v7" />
    </>
  ),
  salt: <path d="M7 10h10l-1.5 10h-7zM9 10V7a3 3 0 0 1 6 0v3M10 4h4" />,
  o2: (
    <>
      <circle cx="9" cy="15" r="4" />
      <circle cx="16" cy="8" r="3" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  plankton: <path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14zM5 19l8-8" />,
}

/** How's the water: four readings, each as an icon and one word. */
export function WaterSlot({ ship }: { ship: ShipState }) {
  const { t } = useLanguage()
  const keys = Object.keys(WATER_WORDS) as WaterKey[]
  const resting = keys.every((key) => ship.row[key] === null)

  return (
    <div className={styles.slot}>
      {resting ? (
        <div className={styles.text}>
          <b>{t('now.water.title')}</b>
          <span>{t('journey.sensorsResting')}</span>
        </div>
      ) : (
        <div className={styles.water}>
          {keys.map((key) => {
            const { group } = WATER_WORDS[key]
            const word = waterWord(key, ship.row[key])
            return (
              <div key={key} className={styles.reading}>
                <svg viewBox="0 0 24 24" className={styles.mini} aria-hidden="true">
                  {WATER_ICONS[group]}
                </svg>
                <small>{t(`now.water.labels.${group}`)}</small>
                <b>{word ? t(`now.water.${group}.${word}` as TKey) : '–'}</b>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Look out: the animal to watch for in this part of the route. */
export function LookoutSlot({ zone }: { zone: ZoneText }) {
  const { t } = useLanguage()
  return (
    <div className={styles.slot}>
      <Photo id={zone.lookout.photoId} alt={zone.lookout.photo} placeholder={t('photo', { name: zone.lookout.photo })} className={styles.photo} showCredit={false} />
      <div className={styles.text}>
        <b>{zone.lookout.title}</b>
        <span>{zone.lookout.text}</span>
      </div>
    </div>
  )
}

const TILT_DEG = { calm: 0, gentle: 8, rolly: 18 }

const VEHICLES = {
  bike: (
    <>
      <circle cx="6" cy="16" r="4" />
      <circle cx="18" cy="16" r="4" />
      <path d="M6 16l4-8h5l3 8M10 8l2 8h6M14 5h3" />
    </>
  ),
  bus: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M3 11h18M7 17v2M17 17v2" />
    </>
  ),
  car: (
    <>
      <path d="M3 15l2-6h14l2 6v3H3z" />
      <circle cx="7.5" cy="18" r="1.6" />
      <circle cx="16.5" cy="18" r="1.6" />
    </>
  ),
}

/** The ride: how fast (as a vehicle) and how smooth (a little boat that leans with the roll). */
export function RideSlot({ ship }: { ship: ShipState }) {
  const { t } = useLanguage()
  const docked = ship.sailing.status === 'docked'
  const like = speedLike(ship.row.speed_over_ground)
  const comfort = docked ? null : comfortOf(ship.history)

  return (
    <div className={styles.slot}>
      <svg viewBox="0 0 24 24" className={styles.vehicle} aria-hidden="true">
        {VEHICLES[like]}
      </svg>
      <div className={styles.text}>
        <b>{t(docked ? 'now.ride.docked' : `now.ride.${like}`)}</b>
        {comfort && (
          <span className={styles.comfort}>
            <svg viewBox="-12 -9 24 18" width="26" height="18" aria-hidden="true">
              <g transform={`rotate(${TILT_DEG[comfort]})`}>
                <path d="M-10 1 L10 1 L7 6 L-7 6 Z" fill="currentColor" />
                <rect x="-5" y="-4" width="9" height="5" rx="1.5" fill="currentColor" />
              </g>
            </svg>
            {t(`journey.comfort.${comfort}`)}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * The island we're passing: one of its specialties each time the slot comes round (what happens this month first).
 * Dev builds mark entries the team hasn't fact-checked yet.
 */
export function IslandSlot({ name, knowledge, turn }: { name: string; knowledge: PlaceKnowledge; turn: number }) {
  const { t } = useLanguage()
  const month = useClock().getMonth() + 1
  const list = orderSpecialties(knowledge, month)
  if (!list.length) return null
  const item = list[turn % list.length]

  return (
    <div className={styles.slot}>
      <span className={styles.kind} role="img" aria-label={t(`knowledge.kinds.${item.kind}`)}>
        <KnowledgeIcon kind={item.kind} size={44} />
      </span>
      <div className={styles.text}>
        <b>{item.text}</b>
        <span>
          {name}
          {knowledge.tagline && ` · ${knowledge.tagline}`}
        </span>
        <span className={styles.badges}>
          {item.thisMonth && <i className={styles.month}>{t('knowledge.thisMonth')}</i>}
          {import.meta.env.DEV && !knowledge.checked && <i className={styles.draft}>{t('knowledge.draft')}</i>}
        </span>
      </div>
    </div>
  )
}
