import { FactSource } from '../../components/SourceLine/FactSource'
import type { SeafloorContent } from '../../types/content'
import styles from './FactCards.module.css'

/** Three dark fact cards under the slice. */
export function FactCards({ facts }: { facts: SeafloorContent['facts'] }) {
  return (
    <div className={styles.cards}>
      {facts.map((f, i) => (
        <div key={f.eyebrow} className={styles.card}>
          <span className={styles.eyebrow}>{f.eyebrow}</span>
          <span className={styles.title}>{f.title}</span>
          <span className={styles.text}>{f.text}</span>
          <FactSource sourceKey={`seafloor.facts.${i}`} className={styles.source} />
        </div>
      ))}
    </div>
  )
}
