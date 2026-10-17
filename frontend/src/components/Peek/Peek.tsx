import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '../../i18n/LanguageContext'
import { Bubble } from '../Bubble/Bubble'
import styles from './Peek.module.css'

interface Props {
  open: boolean
  onClose: () => void
  /** Name of the panel for screen readers */
  label: string
  /** "deep" for underwater content */
  tone?: 'light' | 'deep'
  /** Where the tap was (window px): the panel grows from there */
  origin?: { x: number; y: number } | null
  className?: string
  children: ReactNode
}

/**
 * A large panel that grows out of what was tapped, over a dimmed screen. ✕, a tap outside or Escape closes it,
 * and focus goes back to where it was.
 */
export function Peek({ open, onClose, label, tone = 'light', origin, className = '', children }: Props) {
  const { t } = useLanguage()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  const ox = origin ? `${origin.x}px` : '50vw'
  const oy = origin ? `${origin.y}px` : '50vh'
  return createPortal(
    <div className={styles.peek} style={{ '--ox': ox, '--oy': oy } as CSSProperties}>
      <div className={styles.backdrop} onClick={onClose} />
      <div ref={panel} className={`${styles.panel} ${styles[tone]} ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className={styles.close}>
          <Bubble size={76} aria-label={t('nav.close')} onClick={onClose}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Bubble>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
