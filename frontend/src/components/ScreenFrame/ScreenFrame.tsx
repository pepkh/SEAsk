import type { ReactNode } from 'react'
import { BackButton } from '../BackButton/BackButton'
import { LanguageButton } from '../LanguageButton/LanguageButton'
import styles from './ScreenFrame.module.css'

interface Props {
  title: string
  subtitle?: ReactNode
  /** "surface" under the water (Dive): the back button reads "↑ Surface" */
  back?: 'ferry' | 'surface'
  /** Extra controls next to the language button */
  aside?: ReactNode
  /** Background of the whole screen */
  tone?: 'neu' | 'water'
  className?: string
  bodyClassName?: string
  children: ReactNode
}

/** Every inner screen: the big back button, the title, the language button, then the screen's own content. */
export function ScreenFrame({ title, subtitle, back = 'ferry', aside, tone = 'neu', className = '', bodyClassName = '', children }: Props) {
  return (
    <div className={`${styles.screen} ${styles[tone]} ${className}`}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <BackButton variant={back} />
          <div className={styles.titles}>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <div className={styles.aside}>
            {aside}
            <LanguageButton variant="neu" />
          </div>
        </header>
        <div className={`${styles.body} ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  )
}
