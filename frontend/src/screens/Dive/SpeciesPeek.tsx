import { Photo } from '../../components/Photo/Photo'
import { formatNumber } from '../../i18n/format'
import { useLanguage } from '../../i18n/LanguageContext'
import type { Species } from '../../types/content'
import styles from './SpeciesPeek.module.css'

/** A visitor, for the size check (m) */
const YOU_M = 1.3

/** One animal up close: a big photo, a few words, and how long it is next to you. */
export function SpeciesPeek({ species, featured }: { species: Species; featured: boolean }) {
  const { t, lang } = useLanguage()
  const size = species.sizeM
  const longest = Math.max(YOU_M, size ?? 0)
  const metres = (m: number) => formatNumber(m, Number.isInteger(m) ? 0 : 1, lang)

  return (
    <div className={styles.peek}>
      <Photo id={species.photoId} alt={species.photo} placeholder={t('photo', { name: species.photo })} className={styles.photo} />
      <div className={styles.body}>
        {featured && <span className={styles.badge}>★ {t('seaLife.featured')}</span>}
        <h2 className={styles.name}>{species.name}</h2>
        {species.latin && <span className={styles.latin}>{species.latin}</span>}
        <span className={`${styles.chip} ${styles[species.habitat]}`}>{t(`habitat.${species.habitat}`)}</span>
        <p className={styles.text}>{species.text}</p>
        {size !== undefined && (
          <div className={styles.sizes}>
            <span className={styles.eyebrow}>{t('seaLife.sizeCheck')}</span>
            <div className={styles.row}>
              <span>{t('dive.sizeYou')}</span>
              <i className={styles.you} style={{ width: `${(YOU_M / longest) * 100}%` }} />
              <b>{metres(YOU_M)} m</b>
            </div>
            <div className={styles.row}>
              <span>{species.name}</span>
              <i className={styles.animal} style={{ width: `${(size / longest) * 100}%` }} />
              <b>{t('dive.about', { m: metres(size) })}</b>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
