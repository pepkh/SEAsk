import { Photo } from '../../components/Photo/Photo'
import { formatNumber } from '../../i18n/format'
import { useLanguage } from '../../i18n/LanguageContext'
import type { SpeciesContent } from '../../types/content'
import styles from './FeaturedAnimal.module.css'

/** Dark "Animal of the crossing" card with a size check. */
export function FeaturedAnimal({ featured }: { featured: SpeciesContent['featured'] }) {
  const { t, lang } = useLanguage()
  const longest = Math.max(...featured.sizes.map((s) => s.m))

  return (
    <div className={styles.card}>
      <div className={styles.hero}>
        <Photo id={featured.photoId} alt={featured.photo} placeholder={t('seaLife.heroPhoto', { name: featured.photo })} className={styles.heroPhoto} />
        <span className={styles.badge}>{t('seaLife.featured')}</span>
      </div>
      <div className={styles.body}>
        <div className={styles.names}>
          <span className={styles.name}>{featured.name}</span>
          <span className={styles.latin}>{featured.latin}</span>
        </div>
        <p className={styles.text}>{featured.text}</p>
        <div className={styles.sizes}>
          <span className={styles.eyebrow}>{t('seaLife.sizeCheck')}</span>
          <div className={styles.grid}>
            {featured.sizes.map((s) => (
              <div key={s.role} className={styles.sizeRow}>
                <span>{s.label}</span>
                <div className={`${styles.bar} ${styles[s.role]}`} style={{ width: `${(s.m / longest) * 100}%` }} />
                <span className={styles.metres}>{formatNumber(s.m, Number.isInteger(s.m) ? 0 : 1, lang)} m</span>
              </div>
            ))}
          </div>
          <span className={styles.footnote}>{featured.footnote}</span>
        </div>
      </div>
    </div>
  )
}
