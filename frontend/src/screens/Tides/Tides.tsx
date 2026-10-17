import { AudienceToggle } from '../../components/AudienceToggle/AudienceToggle'
import { LanguageButton } from '../../components/LanguageButton/LanguageButton'
import { PageHeader } from '../../components/PageHeader/PageHeader'
import { SampleChip } from '../../components/SampleChip/SampleChip'
import { useClock } from '../../hooks/useClock'
import { useLanguage } from '../../i18n/LanguageContext'
import { useTides } from '../../tides/useTides'
import { useWeather } from '../../weather/WeatherProvider'
import { CurrentCard } from './CurrentCard'
import { TideChart } from './TideChart'
import styles from './Tides.module.css'
import { TidesExplainer } from './TidesExplainer'
import { WeatherPanel } from './WeatherPanel'

/** Tides & weather: tide curve, current and explainer on the left, weather on the right. */
export function Tides() {
  const { t } = useLanguage()
  const live = useTides()
  const weather = useWeather()
  const now = useClock()
  const tidesLive = live?.source === 'live'
  const weatherLive = weather.sources.weather === 'live'

  return (
    <div className={styles.screen}>
      <section className={styles.section}>
        <PageHeader title={t('tides.title')} subtitle={t('tides.subtitle')}>
          <div className={styles.controls}>
            {/* Names the part that is still sample data, if any. */}
            <SampleChip show={!tidesLive || !weatherLive} label={tidesLive ? 'sampleWeather' : weatherLive ? 'sampleTides' : 'sampleData'} />
            <AudienceToggle variant="plain" adultsOpensJourney />
            <LanguageButton variant="plain" />
          </div>
        </PageHeader>
        {live && (
          <div className={styles.body}>
            <div className={styles.left}>
              <TideChart tides={live.tides} now={now} />
              <div className={styles.pair}>
                <CurrentCard place={live.currentPlace} current={live.tides.current} />
                <TidesExplainer explainer={live.tides.explainer} />
              </div>
            </div>
            <WeatherPanel weather={weather} />
          </div>
        )}
      </section>
    </div>
  )
}
