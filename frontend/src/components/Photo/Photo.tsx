import { PhotoPlaceholder } from '../PhotoPlaceholder/PhotoPlaceholder'
import styles from './Photo.module.css'
import { PHOTOS } from './photos'

interface Props {
  id: string | undefined
  /** What the photo shows (the translated content text) */
  alt: string
  /** Shown in the grey box when there is no photo for the id */
  placeholder: string
  className?: string
  /** The credit line over the bottom of the photo. Turn it off when the card shows it elsewhere. */
  showCredit?: boolean
}

/** A real photo filling its box, with its credit, or the grey placeholder box. */
export function Photo({ id, alt, placeholder, className = '', showCredit = true }: Props) {
  const photo = id ? PHOTOS[id] : undefined
  if (!photo) return <PhotoPlaceholder label={placeholder} className={className} />
  return (
    <figure className={`${styles.photo} ${className}`}>
      <img src={photo.src} alt={alt} width={photo.width} height={photo.height} decoding="async" />
      {showCredit && <figcaption className={styles.credit}>{photo.credit}</figcaption>}
    </figure>
  )
}
