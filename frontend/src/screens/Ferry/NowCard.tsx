import { useEffect, useState } from 'react'
import { useContent } from '../../hooks/useContent'
import { Card } from '../../components/Card/Card'
import { useAgo } from '../../components/LiveBar/LiveBar'
import { SampleChip } from '../../components/SampleChip/SampleChip'
import { useClock } from '../../hooks/useClock'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { formatTime } from '../../i18n/format'
import { nearestIsland } from '../../map/findLandmark'
import { useLanguage } from '../../i18n/LanguageContext'
import { useTimeShift, type ShipState } from '../../ship/ShipProvider'
import type { ZoneText } from '../../types/content'
import { tripPhase } from './abstract'
import styles from './NowCard.module.css'
import { IslandSlot, LookoutSlot, OutsideSlot, RideSlot, WaterSlot } from './slots'

/** Each fact stays this long before the next one slides in (ms). */
const SLOT_MS = 7000
/** An island counts as "passing" when its shore is this close to the ship (m). */
const ISLAND_M = 3000
/** Facts in a full round with an island (the island's specialty moves on once per round) */
const ROUND = 5

/**
 * The one card on the ferry screen. The top always shows where we are and how long is left; the bottom shows one
 * fact at a time, changing by itself (a card never reacts to touch). The diver mascot stands in its right column.
 */
export function NowCard({ ship, zone, className = '' }: { ship: ShipState; zone: ZoneText; className?: string }) {
  const { t, lang } = useLanguage()
  const now = useClock()
  const reduced = useReducedMotion()
  const landmarks = useContent('landmarks')
  /** Facts shown so far; the slot is tick % count, and each round shows the island's next specialty */
  const [tick, setTick] = useState(0)
  const rewound = useTimeShift().at !== null
  const ago = useAgo()
  const { sailing } = ship
  const phase = tripPhase(sailing)

  // The island we're passing, if its shore is near and we have something to say about it.
  const island = nearestIsland(ship.row.latitude, ship.row.longitude, ISLAND_M)
  const islandText = island ? landmarks?.[island.id] : undefined
  const knowledge = islandText?.knowledge?.specialties?.length ? islandText.knowledge : undefined

  const slots = [
    <OutsideSlot key="outside" />,
    <WaterSlot key="water" ship={ship} />,
    <LookoutSlot key="lookout" zone={zone} />,
    <RideSlot key="ride" ship={ship} />,
  ]
  if (islandText && knowledge) slots.push(<IslandSlot key="island" name={islandText.name} knowledge={knowledge} turn={Math.floor(tick / ROUND)} />)
  const index = tick % slots.length

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), reduced ? SLOT_MS * 1.5 : SLOT_MS)
    return () => clearInterval(id)
  }, [reduced])

  return (
    <Card className={`${styles.card} ${rewound ? styles.rewound : ''} ${className}`} data-tour="now-card" aria-label={t('now.label')}>
      <div className={styles.main}>
        <div className={styles.top}>
          {rewound ? (
            <span className={styles.ago}>⟲ {ago}</span>
          ) : (
            <span className={styles.live}>
              <i />
              {t('now.live')}
            </span>
          )}
          <span className={styles.clock}>{formatTime(now, lang)}</span>
          <SampleChip variant="outline" show={ship.source === 'sample'} />
        </div>
        <div className={styles.where}>
          <small>{t('now.passing')}</small>
          <b>{islandText && knowledge ? islandText.name : zone.here}</b>
        </div>
        <div className={styles.when}>
          {sailing.etaMin === null ? t('now.docked', { place: sailing.to.name }) : t('now.eta', { min: sailing.etaMin, place: sailing.to.name })}
          {phase !== 'docked' && <span> · {t(`now.trip.${phase}`)}</span>}
        </div>
        <div className={styles.slot} aria-live="off">
          {slots[index]}
        </div>
        <div className={styles.dots} role="img" aria-label={t('now.slot', { n: index + 1, total: slots.length })}>
          {slots.map((s, i) => <i key={s.key} className={i === index ? styles.on : ''} />)}
        </div>
      </div>
      {/* The diver's home on the ferry screen: it stands here (drawn by the Guide layer, so it can still talk and be
          tapped) until it jumps out to dive. */}
      <div className={styles.diverSpot} data-guide-home aria-hidden="true" />
    </Card>
  )
}
