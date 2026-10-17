import type { MouseEvent } from 'react'
import { Photo } from '../../components/Photo/Photo'
import { useLanguage } from '../../i18n/LanguageContext'
import type { Species } from '../../types/content'
import styles from './SpeciesTile.module.css'

interface Props {
  species: Species
  /** The "Animal of the crossing" gets a badge */
  featured: boolean
  onPress: (e: MouseEvent<HTMLButtonElement>) => void
}

/** A neumorphic tile you can touch (the underwater version of a bubble): a round photo and the animal's name. */
export function SpeciesTile({ species, featured, onPress }: Props) {
  const { t } = useLanguage()
  return (
    <button type="button" className={styles.tile} onClick={onPress} aria-label={t('dive.open', { name: species.name })}>
      {featured && <span className={styles.badge}>★</span>}
      <span className={styles.well}>
        <Photo id={species.photoId} alt="" placeholder={species.photo} className={styles.photo} showCredit={false} />
      </span>
      <span className={styles.name}>{species.name}</span>
    </button>
  )
}
