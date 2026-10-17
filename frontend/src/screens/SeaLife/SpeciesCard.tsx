import { PhotoPlaceholder } from '../../components/PhotoPlaceholder/PhotoPlaceholder'
import { useLanguage } from '../../i18n/LanguageContext'
import type { Species } from '../../types/content'
import styles from './SpeciesCard.module.css'

/** Species card with a photo placeholder and a habitat chip. */
export function SpeciesCard({ species }: { species: Species }) {
  const { t } = useLanguage()
  return (
    <div className={styles.card}>
      <PhotoPlaceholder label={t('photo', { name: species.photo })} className={styles.photo} />
      <div className={styles.body}>
        <div className={styles.top}>
          <span className={styles.name}>{species.name}</span>
          <span className={`${styles.chip} ${styles[species.habitat]}`}>{t(`habitat.${species.habitat}`)}</span>
        </div>
        <span className={styles.text}>{species.text}</span>
      </div>
    </div>
  )
}
