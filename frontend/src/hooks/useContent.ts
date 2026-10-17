import { useEffect, useState } from 'react'
import { getContent } from '../api/client'
import { useLanguage } from '../i18n/LanguageContext'
import type { ContentMap, ContentName } from '../types/content'

/** Static content in the current language. Null until the first load is done. */
export function useContent<K extends ContentName>(name: K): ContentMap[K] | null {
  const { lang } = useLanguage()
  const [data, setData] = useState<ContentMap[K] | null>(null)

  useEffect(() => {
    let live = true
    getContent(name, lang)
      .then((result) => live && setData(result))
      .catch((err) => console.error(err))
    return () => {
      live = false
    }
  }, [name, lang])

  return data
}
