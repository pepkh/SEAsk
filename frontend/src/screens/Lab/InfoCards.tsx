import { RECORDED_DAY } from '../../api/shipFeed'
import { PinIcon } from '../../components/icons'
import { FactSource } from '../../components/SourceLine/FactSource'
import { KIOSK_SOURCES, SOURCES } from '../../config/sources'
import { formatDay, formatNumber } from '../../i18n/format'
import { useLanguage } from '../../i18n/LanguageContext'
import type { ZoneText } from '../../types/content'
import type { ProfileBin } from '../../types/profile'
import styles from './InfoCards.module.css'

/** Zone pill on the Grown-ups map (dark pin). */
export function PlacePill({ zone, className = '' }: { zone: ZoneText; className?: string }) {
  return (
    <div className={`${styles.pill} ${className}`}>
      <span className={styles.pin}><PinIcon size={20} /></span>
      <div className={styles.pillText}>
        <span className={styles.pillEyebrow}>{zone.here}</span>
        <span className={styles.pillTitle}>{zone.adultTitle}</span>
      </div>
    </div>
  )
}

/** Smallest differences from the route mean worth a chip: °C, PSU and % saturation. */
const MIN_DIFF = { sst: 0.3, salinity: 0.3, o2: 3 }

/**
 * "What's happening here" for the current zone. With `usual` (the route profile bin under the ship)
 * it also says how the water here usually differs from the whole route, e.g. colder and less
 * oxygen in Active Pass.
 */
export function HappeningCard({ zoneId, zone, usual, className = '' }: { zoneId: string; zone: ZoneText; usual?: ProfileBin; className?: string }) {
  const { t, lang } = useLanguage()
  const chips: string[] = []
  if (usual && usual.n > 0) {
    const { sst_anom: sst, salinity_anom: sal, o2_sat_anom: o2 } = usual
    if (sst !== null && Math.abs(sst) >= MIN_DIFF.sst)
      chips.push(t(sst < 0 ? 'journey.compare.colder' : 'journey.compare.warmer', { v: formatNumber(Math.abs(sst), 1, lang) }))
    if (sal !== null && Math.abs(sal) >= MIN_DIFF.salinity)
      chips.push(t(sal < 0 ? 'journey.compare.fresher' : 'journey.compare.saltier', { v: formatNumber(Math.abs(sal), 1, lang) }))
    if (o2 !== null && Math.abs(o2) >= MIN_DIFF.o2)
      chips.push(t(o2 < 0 ? 'journey.compare.lessO2' : 'journey.compare.moreO2', { v: formatNumber(Math.abs(o2), 0, lang) }))
  }
  return (
    <div className={`${styles.happening} ${className}`}>
      <span className={styles.eyebrow}>{t('journey.happening')}</span>
      <span className={styles.title}>{zone.happening.title}</span>
      <p>{zone.happening.text}</p>
      <FactSource sourceKey={`zones.${zoneId}.happening`} />
      {chips.length > 0 && (
        <div className={styles.compare}>
          <span className={styles.compareTitle}>{t('journey.compare.title')}</span>
          <div className={styles.chips}>
            {chips.map((chip) => (
              <span key={chip} className={styles.chip}>{chip}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Dark "About the data" card: where the readings come from, what QC means, and every data source with its licence. */
export function AboutDataCard() {
  const { t, lang } = useLanguage()
  const date = formatDay(RECORDED_DAY, lang)
  return (
    <div className={styles.about}>
      <span className={styles.eyebrow}>{t('journey.aboutData')}</span>
      <p>{t('journey.aboutDataText', { date })}</p>
      <span className={styles.note}>{t('journey.qcNote', { date })}</span>
      <span className={styles.eyebrow}>{t('journey.sources')}</span>
      <ul className={styles.sources}>
        {KIOSK_SOURCES.map((id) => (
          <li key={id}>
            {SOURCES[id].name[lang]} <span>· {SOURCES[id].licence[lang]}</span>
          </li>
        ))}
      </ul>
      {/* The tide licence asks for its notice in full */}
      <small className={styles.notice}>{SOURCES.dfo.notice[lang]}</small>
    </div>
  )
}
