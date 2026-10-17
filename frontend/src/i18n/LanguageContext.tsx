import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import en from './en.json'
import fr from './fr.json'

export type Lang = 'en' | 'fr'

/** fr.json must have the same keys as en.json. */
const DICTIONARIES: Record<Lang, typeof en> = { en, fr }

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

/** A dot path to one UI string, for example "dock.journey". */
export type TKey = Leaves<typeof en>
export type TVars = Record<string, string | number>

interface LanguageValue {
  lang: Lang
  toggle: () => void
  /** Set a language, e.g. back to English when a visitor session ends. */
  setLang: (lang: Lang) => void
  t: (key: TKey, vars?: TVars) => string
}

const LanguageContext = createContext<LanguageValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en')
  const toggle = useCallback(() => setLang((l) => (l === 'en' ? 'fr' : 'en')), [])
  const value = useMemo<LanguageValue>(() => {
    const dict = DICTIONARIES[lang]
    const t = (key: TKey, vars?: TVars) => {
      const text = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], dict) as string
      return vars ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? '')) : text
    }
    return { lang, toggle, setLang, t }
  }, [lang, toggle])
  return <LanguageContext value={value}>{children}</LanguageContext>
}

// eslint-disable-next-line react/only-export-components
export function useLanguage(): LanguageValue {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useLanguage needs a LanguageProvider')
  return value
}
