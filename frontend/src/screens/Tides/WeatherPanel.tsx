import { compassPoint, formatNumber, timeParts, todayAt } from '../../i18n/format'
import { useLanguage } from '../../i18n/LanguageContext'
import type { WeatherContent } from '../../types/content'
import styles from './WeatherPanel.module.css'

/** "Outside right now" card and the four weather tiles. */
export function WeatherPanel({ weather }: { weather: WeatherContent }) {
  const { t, lang } = useLanguage()
  const sunset = timeParts(todayAt(weather.sunset), lang)
  const windDir = compassPoint(weather.wind.fromDeg, t('compass'))

  return (
    <div className={styles.panel}>
      <div className={styles.outside}>
        <div className={styles.outsideText}>
          <span className={styles.eyebrow}>{t('tides.outside')}</span>
          <span className={styles.temp}>{weather.tempC}°</span>
          <span className={styles.sky}>{t('tides.feelsLike', { sky: weather.sky, t: weather.feelsLikeC })}</span>
        </div>
        <svg viewBox="0 0 120 100" className={styles.icon} aria-hidden="true">
          <circle cx="72" cy="38" r="24" fill="#F5C04A" />
          <path d="M24 82 Q12 82 12 70 Q12 58 26 58 Q30 42 48 42 Q64 42 68 58 Q84 56 88 70 Q90 82 76 82 Z" fill="#E4E9EC" stroke="#C9D1D4" strokeWidth="2" />
        </svg>
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
            {weather.wind.kn} <span>{t('tides.windFrom', { dir: windDir })}</span>
          </span>
        </div>
        <div className={styles.tile}>
          <span className={styles.label}>{t('tides.waves')}</span>
          <svg viewBox="0 0 80 40" className={styles.wave} aria-hidden="true">
            <path d="M2 26 Q12 12 22 26 T42 26 T62 26 T82 26" fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="4" strokeLinecap="round" />
          </svg>
          <span className={styles.value}>
            {formatNumber(weather.waves.m, 1, lang)} <span>m · {weather.waves.text}</span>
          </span>
        </div>
        <div className={styles.tile}>
          <span className={styles.label}>{t('tides.visibility')}</span>
          <span className={styles.value}>
            {weather.visibilityKm} <span>km</span>
          </span>
          <span className={styles.note}>{weather.visibilityText}</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.label}>{t('tides.sunset')}</span>
          <span className={styles.value}>
            {sunset.main} {sunset.period && <span>{sunset.period}</span>}
          </span>
          <span className={styles.note}>{t('tides.moonTonight', { phase: weather.moonPhase })}</span>
        </div>
      </div>
    </div>
  )
}
