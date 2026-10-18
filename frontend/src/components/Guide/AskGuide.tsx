import { useState } from 'react'
import { useContent } from '../../hooks/useContent'
import { useRouteProfile } from '../../hooks/useRouteProfile'
import { useLanguage } from '../../i18n/LanguageContext'
import { formatNumber } from '../../i18n/format'
import { createMockProvider } from '../../qa/mockProvider'
import type { QaContext } from '../../qa/types'
import { binAt } from '../../ship/profile'
import { useShip } from '../../ship/ShipProvider'
import styles from './Guide.module.css'

interface Props {
  /** The answer to say (the diver says it in its speech bubble) */
  onAnswer: (text: string) => void
  /** On the ferry screen: start the guided tour */
  onTour?: () => void
  onClose: () => void
}

/**
 * "Ask the diver": a few questions in the diver's speech bubble, answered with canned text and the
 * live readings (depth, salinity, water temperature). A preview of the assistant planned for later.
 */
export function AskGuide({ onAnswer, onTour, onClose }: Props) {
  const content = useContent('guide-qa')
  const { lang } = useLanguage()
  const ship = useShip()
  const profile = useRouteProfile()
  const [provider] = useState(() => createMockProvider(''))
  if (!content) return null

  const context = (): QaContext => {
    const depth = ship ? binAt(profile, ship.sailing.fraction).depth_m : null
    const sal = ship?.row.salinity ?? null
    const temp = ship?.row.tsg_temperature ?? null
    return {
      values: {
        depth: depth && depth > 5 ? formatNumber(depth, 0, lang) : null,
        houses: depth && depth > 5 ? formatNumber(Math.max(1, Math.round(depth / 8)), 0, lang) : null,
        salinity: sal !== null ? formatNumber(sal, 0, lang) : null,
        waterTemp: temp !== null ? formatNumber(temp, 1, lang) : null,
      },
    }
  }

  const ask = async (id: string) => {
    const item = content.items.find((q) => q.id === id)
    if (!item) return
    const answer = await provider.ask(item, content.items, context())
    onAnswer(answer.text)
  }

  return (
    <div className={`${styles.say} ${styles.ask}`}>
      <span className={styles.askHead}>
        <b>{content.title}</b>
        <button type="button" className={styles.askClose} onClick={onClose} aria-label={content.close}>
          ×
        </button>
      </span>
      <span className={styles.askChips}>
        {onTour && (
          <button type="button" data-kind="tour" onClick={onTour}>
            {content.tour}
          </button>
        )}
        {content.items.map((q) => (
          <button key={q.id} type="button" onClick={() => ask(q.id)}>
            {q.question}
          </button>
        ))}
      </span>
      <small className={styles.askPreview}>{content.preview}</small>
    </div>
  )
}
