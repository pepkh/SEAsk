import { contentSources } from '../../hooks/contentSources'
import { useLanguage, type TKey, type TVars } from '../../i18n/LanguageContext'
import styles from './SourceLine.module.css'

/**
 * "Source: …" under a written fact (publisher names only: a kiosk cannot open links); `sourceKey` can list the keys
 * of several facts shown together. Nothing when they have none.
 */
export function FactSource({ sourceKey, className = '' }: { sourceKey: string | string[]; className?: string }) {
  const { t } = useLanguage()
  const text = factSourceText(sourceKey, t)
  return text ? <small className={`${styles.line} ${className}`}>{text}</small> : null
}

/** The "Source: …" text of written facts (keys as in src/hooks/contentSources.ts), or null when they have none. */
// eslint-disable-next-line react/only-export-components
export function factSourceText(keys: string | string[], t: (key: TKey, vars?: TVars) => string): string | null {
  const names = [...new Set([keys].flat().flatMap((key) => contentSources(key)?.sources.map((s) => s.name) ?? []))]
  if (!names.length) return null
  return names.length === 1 ? t('credits.source', { name: names[0] }) : t('credits.sources', { names: names.join(', ') })
}
