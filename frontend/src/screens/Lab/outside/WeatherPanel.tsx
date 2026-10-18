import { SourceLine } from '../../../components/SourceLine/SourceLine'
import type { SourceId } from '../../../config/sources'
import { useDataTime } from '../../../hooks/useDataTime'
import { compassPoint, formatNumber, timeParts, todayAt } from '../../../i18n/format'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { Weather } from '../../../types/weather'
import { skyOf, visibilityOf, waveSizeOf } from '../../../weather/describe'
import { moonPhase } from '../../../weather/moon'
import { WeatherIcon } from './WeatherIcon'
import styles from './WeatherPanel.module.css'

/** "Outside right now" card and the four weather tiles, with the credit of each source. */
export function WeatherPanel({ weather }: { weather: Weather }) {
  const { t, lang } = useLanguage()
  // The moon of the same night as the sunset shown (the recorded day's, without live weather)
  const now = useDataTime(weather.sources.weather)
  const sunset = timeParts(todayAt(weather.sunset), lang)
  const windDir = compassPoint(weather.wind.fromDeg, t('compass'))
  const sky = skyOf(weather.condition.id)
  // OpenWeatherMap live, else the recorded day's Open-Meteo model; waves are always Open-Meteo Marine (Copernicus Marine models).
  const sources: SourceId[] = [weather.sources.weather === 'live' ? 'owm' : 'openMeteo']
  if (weather.waves) sources.push('openMeteo', 'copernicusMarine')
  const recorded = weather.sources.weather === 'sample' || (weather.waves !== null && weather.sources.waves === 'sample')

  return (
    <div className={styles.panel}>
      <div className={styles.outside}>
        <div className={styles.outsideText}>
          <span className={styles.eyebrow}>{t('tides.outside')}</span>
          <span className={styles.temp}>{Math.round(weather.tempC)}°</span>
          <span className={styles.sky}>{t('tides.feelsLike', { sky: t(`weather.sky.${sky}`), t: Math.round(weather.feelsLikeC) })}</span>
        </div>
        <WeatherIcon sky={sky} night={weather.condition.icon.endsWith('n')} className={styles.icon} />
      </div>
      <div className={styles.tiles}>
        <div className={styles.tile}>
          <span className={styles.label}>{t('tides.wind')}</span>
          {/* The grey line points to where the wind comes from; the accent line to where it goes. */}
          <svg viewBox="0 0 60 60" className={styles.dial} aria-hidden="true">
            <circle cx="30" cy="30" r="26" fill="none" stroke="#DCE1E3" strokeWidth="2" />
            <g transform={`rotate(${weather.wind.fromDeg - 315} 30 30)`}>
              <path d="M30 30 L46 46" style={{ stroke: 'var(--accent)' }} strokeWidth="4" strokeLinecap="round" />
              <path d="M14 14 L30 30" stroke="#C3CCD0" strokeWidth="4" strokeLinecap="round" />
            </g>
          </svg>
          <span className={styles.value}>
            {Math.round(weather.wind.kn)} <span>{t('tides.windFrom', { dir: windDir })}</span>
          </span>
        </div>
        <div className={styles.tile}>
          <span className={styles.label}>{t('tides.waves')}</span>
          <svg viewBox="0 0 80 40" className={styles.wave} aria-hidden="true">
            <path d="M2 26 Q12 12 22 26 T42 26 T62 26 T82 26" fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="4" strokeLinecap="round" />
          </svg>
          <span className={styles.value}>
            {formatNumber(weather.waves?.m, 1, lang)} {weather.waves && <span>m · {t(`weather.waves.${waveSizeOf(weather.waves.m)}`)}</span>}
          </span>
        </div>
        <div className={styles.tile}>
          <span className={styles.label}>{t('tides.visibility')}</span>
          <span className={styles.value}>
            {formatNumber(weather.visibilityKm, 0, lang)} <span>km</span>
          </span>
          {weather.visibilityKm !== null && <span className={styles.note}>{t(`weather.visibility.${visibilityOf(weather.visibilityKm)}`)}</span>}
        </div>
        <div className={styles.tile}>
          <span className={styles.label}>{t('tides.sunset')}</span>
          <span className={styles.value}>
            {sunset.main} {sunset.period && <span>{sunset.period}</span>}
          </span>
          <span className={styles.note}>{t('tides.moonTonight', { phase: t(`weather.moon.${moonPhase(now)}`) })}</span>
        </div>
      </div>
      <SourceLine ids={sources} full recorded={recorded} className={styles.credits} />
    </div>
  )
}
