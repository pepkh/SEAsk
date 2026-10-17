import { useState } from 'react'
import { PageHeader } from '../../components/PageHeader/PageHeader'
import { useContent } from '../../hooks/useContent'
import { useLanguage } from '../../i18n/LanguageContext'
import { useShip } from '../../ship/ShipProvider'
import type { SpeciesGroup } from '../../types/content'
import { FeaturedAnimal } from './FeaturedAnimal'
import { FilterPills } from './FilterPills'
import styles from './SeaLife.module.css'
import { SpeciesCard } from './SpeciesCard'
import { SpottedCard } from './SpottedCard'

/** Sea life: featured animal on the left, filterable species cards on the right. */
export function SeaLife() {
  const { t } = useLanguage()
  const species = useContent('species')
  const zones = useContent('zones')
  const ship = useShip()
  const [group, setGroup] = useState<SpeciesGroup | 'all'>('all')

  if (!species) return <div className={styles.screen} />
  const place = ship && zones ? zones[ship.sailing.zoneId].here : ''
  const items = species.items.filter((s) => group === 'all' || s.group === group)

  return (
    <div className={styles.screen}>
      <section className={styles.featured}>
        <FeaturedAnimal featured={species.featured} />
      </section>
      <section className={styles.catalogue}>
        <PageHeader
          compact
          title={t('seaLife.title')}
          subtitle={
            <>
              {t('seaLife.subtitleStart')}
              <b>{place}</b>
              {t('seaLife.subtitleEnd')}
            </>
          }
        >
          <FilterPills value={group} onChange={setGroup} />
        </PageHeader>
        <div className={styles.grid}>
          {items.map((s) => <SpeciesCard key={s.id} species={s} />)}
          <SpottedCard />
        </div>
      </section>
    </div>
  )
}
