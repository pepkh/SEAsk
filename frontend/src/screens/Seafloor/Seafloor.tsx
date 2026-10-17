import { PageHeader } from '../../components/PageHeader/PageHeader'
import { useContent } from '../../hooks/useContent'
import { useLanguage } from '../../i18n/LanguageContext'
import { useShip } from '../../ship/ShipProvider'
import { FactCards } from './FactCards'
import styles from './Seafloor.module.css'
import { SliceView } from './SliceView'

/** Seafloor (dark): a depth slice along the route with the ship, and three fact cards. */
export function Seafloor() {
  const { t } = useLanguage()
  const content = useContent('seafloor')
  const zones = useContent('zones')
  const ship = useShip()

  return (
    <div className={styles.screen}>
      <section className={styles.section}>
        <PageHeader title={t('seafloor.title')} subtitle={t('seafloor.subtitle')}>
          {/* "3D seafloor" is not designed yet, so the toggle shows the slice view only. */}
          <div className={styles.toggle} role="group" aria-label={t('seafloor.viewLabel')}>
            <button type="button" aria-pressed="true">{t('seafloor.slice')}</button>
            <button type="button" aria-pressed="false">{t('seafloor.threeD')}</button>
          </div>
        </PageHeader>
        {content && ship && zones && (
          <>
            <SliceView content={content} sailing={ship.sailing} place={zones[ship.sailing.zoneId].here} />
            <FactCards facts={content.facts} />
          </>
        )}
      </section>
    </div>
  )
}
