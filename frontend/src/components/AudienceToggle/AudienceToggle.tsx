import { useNavigate } from 'react-router'
import { useKiosk, type Audience } from '../../context/KioskContext'
import { useLanguage } from '../../i18n/LanguageContext'
import styles from './AudienceToggle.module.css'

export type ControlVariant = 'glass' | 'floating' | 'plain'

interface Props {
  /** glass: over the 3D sea; floating: over a map; plain: in a page header */
  variant: ControlVariant
  /** The mockups link "Grown-ups" on Tides and Quiz to the Grown-ups Journey screen. */
  adultsOpensJourney?: boolean
}

export function AudienceToggle({ variant, adultsOpensJourney = false }: Props) {
  const { audience, setAudience } = useKiosk()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const select = (next: Audience) => {
    setAudience(next)
    if (next === 'adults' && adultsOpensJourney) navigate('/journey')
  }

  return (
    <div className={`${styles.seg} ${styles[variant]}`} role="group" aria-label={t('audience.label')}>
      {(['kids', 'adults'] as const).map((value) => (
        <button key={value} type="button" aria-pressed={audience === value} onClick={() => select(value)}>
          {t(`audience.${value}`)}
        </button>
      ))}
    </div>
  )
}
