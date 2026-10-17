import { useLanguage } from '../../i18n/LanguageContext'
import type { ControlVariant } from '../AudienceToggle/AudienceToggle'
import styles from './LanguageButton.module.css'

/** "EN · FR". A tap switches the language. The look stays the same as the mockup. */
export function LanguageButton({ variant }: { variant: ControlVariant }) {
  const { t, toggle } = useLanguage()
  return (
    <button type="button" className={`${styles.lang} ${styles[variant]}`} aria-label={t('language.label')} onClick={toggle}>
      {t('language.button')}
    </button>
  )
}
