import { Bubble } from '../../components/Bubble/Bubble'
import { RisingBubbles } from '../../components/RisingBubbles/RisingBubbles'
import { useLanguage } from '../../i18n/LanguageContext'
import { depthAt } from '../../ship/slice'
import { depthLike } from './abstract'
import styles from './DiveBubble.module.css'

/** Dive in: water inside the bubble, the depth under the ship, and a way down to the Dive screen. */
export function DiveBubble({ fraction, onPress }: { fraction: number; onPress: () => void }) {
  const { t } = useLanguage()
  const m = depthAt(fraction)
  return (
    <Bubble size={330} tone="water" bob={3.4} onClick={onPress} data-tour="dive" aria-label={`${t('bubbles.dive')}: ${t('bubbles.diveBelow', { m })}`}>
      <RisingBubbles count={14} seed={11} maxSize={0.07} speed={5} />
      <span className={styles.face}>
        <b>{t('bubbles.dive')}</b>
        <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.arrow}>
          <path d="M12 4v15M5 12l7 7 7-7" />
        </svg>
        <span className={styles.depth}>{t('bubbles.diveBelow', { m })}</span>
        <small>{t('bubbles.diveLike', { n: depthLike(m) })}</small>
      </span>
    </Bubble>
  )
}
