import { useEffect, useState, type MouseEvent } from 'react'
import { Bubble } from '../../components/Bubble/Bubble'
import { useGuide, useGuideSpot } from '../../components/Guide/GuideContext'
import { Peek } from '../../components/Peek/Peek'
import { ScreenFrame } from '../../components/ScreenFrame/ScreenFrame'
import { useContent } from '../../hooks/useContent'
import { useLanguage } from '../../i18n/LanguageContext'
import { useShip } from '../../ship/ShipProvider'
import type { Species } from '../../types/content'
import { BAND_OF, BANDS } from './bands'
import { DepthGauge } from './DepthGauge'
import styles from './Dive.module.css'
import { FactCards } from './FactCards'
import { SliceView } from './SliceView'
import { SpeciesPeek } from './SpeciesPeek'
import { SpeciesTile } from './SpeciesTile'

type Open = { kind: 'species'; species: Species } | { kind: 'slice' }

const originOf = (e: MouseEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/**
 * Dive into the ocean (below the water): who lives under the ferry, in three depth bands that darken going down,
 * with the water column under the ship beside them. The seafloor slice along the route is one tap away.
 */
export function Dive() {
  const { t } = useLanguage()
  const species = useContent('species')
  const seafloor = useContent('seafloor')
  const zones = useContent('zones')
  const ship = useShip()
  const { say } = useGuide()
  useGuideSpot('corner-right')
  const [open, setOpen] = useState<Open | null>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const id = setTimeout(() => say(t('guide.dive'), 5000), 1100)
    return () => clearTimeout(id)
  }, [say, t])

  const close = () => setOpen(null)
  const selected = open?.kind === 'species' ? open.species : null

  return (
    <ScreenFrame title={t('dive.title')} subtitle={t('dive.subtitle')} back="surface" tone="water" bodyClassName={styles.body}>
      <aside className={styles.side}>
        {ship && <DepthGauge fraction={ship.sailing.fraction} highlight={selected ? BAND_OF[selected.habitat] : null} />}
        <Bubble
          size={150}
          bob={1.5}
          caption={t('dive.route')}
          onClick={(e) => {
            setOrigin(originOf(e))
            setOpen({ kind: 'slice' })
          }}
        >
          <svg viewBox="0 0 48 32" width="78" height="52" aria-hidden="true">
            <path d="M2 6 H46" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
            <path d="M2 10 C10 14 14 26 22 24 S34 12 46 18 V32 H2 Z" fill="var(--water-deep)" />
          </svg>
        </Bubble>
      </aside>

      <div className={styles.bands}>
        {species &&
          BANDS.map((band) => (
            <section key={band} className={`${styles.band} ${styles[band]}`} aria-label={t(`dive.bands.${band}`)}>
              <h2 className={styles.bandName}>{t(`dive.bands.${band}`)}</h2>
              <div className={styles.tiles}>
                {species.items
                  .filter((s) => BAND_OF[s.habitat] === band)
                  .map((s) => (
                    <SpeciesTile
                      key={s.id}
                      species={s}
                      featured={s.id === species.featuredId}
                      onPress={(e) => {
                        setOrigin(originOf(e))
                        setOpen({ kind: 'species', species: s })
                      }}
                    />
                  ))}
              </div>
            </section>
          ))}
      </div>

      <Peek open={open?.kind === 'species'} onClose={close} label={selected?.name ?? ''} origin={origin}>
        {selected && species && <SpeciesPeek species={selected} featured={selected.id === species.featuredId} />}
      </Peek>
      <Peek open={open?.kind === 'slice'} onClose={close} label={t('dive.route')} tone="deep" origin={origin} className={styles.slicePeek}>
        <h2 className={styles.peekTitle}>{t('dive.route')}</h2>
        {seafloor && ship && zones && (
          <div className={styles.slice}>
            <SliceView content={seafloor} sailing={ship.sailing} place={zones[ship.sailing.zoneId].here} />
            <FactCards facts={seafloor.facts} />
          </div>
        )}
      </Peek>
    </ScreenFrame>
  )
}
