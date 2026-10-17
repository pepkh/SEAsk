import { useLanguage } from '../../i18n/LanguageContext'
import styles from './LanguageButton.module.css'

/** glass: over the 3D sea; floating: over a map; plain: on a light page; neu: on a neumorphic inner screen */
export type ControlVariant = 'glass' | 'floating' | 'plain' | 'neu'

/** "EN · FR". A tap switches the language. */
export function LanguageButton({ variant }: { variant: ControlVariant }) {
  const { t, toggle } = useLanguage()
  return (
    <button type="button" className={`${styles.lang} ${styles[variant]}`} aria-label={t('language.label')} onClick={toggle}>
      {t('language.button')}
    </button>
  )
}
