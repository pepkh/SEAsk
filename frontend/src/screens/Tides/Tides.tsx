import { AudienceToggle } from '../../components/AudienceToggle/AudienceToggle'
import { LanguageButton } from '../../components/LanguageButton/LanguageButton'
import { PageHeader } from '../../components/PageHeader/PageHeader'
import { SampleChip } from '../../components/SampleChip/SampleChip'
import { useContent } from '../../hooks/useContent'
import { useLanguage } from '../../i18n/LanguageContext'
import { CurrentCard } from './CurrentCard'
import { TideChart } from './TideChart'
import styles from './Tides.module.css'
import { TidesExplainer } from './TidesExplainer'
import { WeatherPanel } from './WeatherPanel'

/** Tides & weather: tide curve, current and explainer on the left, weather on the right. */
export function Tides() {
  const { t } = useLanguage()
  const tides = useContent('tides')
  const weather = useContent('weather')

  return (
    <div className={styles.screen}>
      <section className={styles.section}>
        <PageHeader title={t('tides.title')} subtitle={t('tides.subtitle')}>
          <div className={styles.controls}>
            <SampleChip />
            <AudienceToggle variant="plain" adultsOpensJourney />
            <LanguageButton variant="plain" />
          </div>
        </PageHeader>
        {tides && weather && (
          <div className={styles.body}>
            <div className={styles.left}>
              <TideChart tides={tides} />
              <div className={styles.pair}>
                <CurrentCard place={tides.place} current={tides.current} />
                <TidesExplainer explainer={tides.explainer} />
              </div>
            </div>
            <WeatherPanel weather={weather} />
          </div>
        )}
      </section>
    </div>
  )
}
