import { API_URL, USE_MOCKS } from '../config/env'
import type { Lang } from '../i18n/LanguageContext'
import type { ContentMap, ContentName } from '../types/content'

const mocks = import.meta.glob<unknown>('../mocks/{en,fr}/*.json', { import: 'default' })

/** Static content: mock JSON now, GET /api/{name}?lang= when VITE_USE_MOCKS=false. */
export async function getContent<K extends ContentName>(name: K, lang: Lang): Promise<ContentMap[K]> {
  if (USE_MOCKS) {
    const load = mocks[`../mocks/${lang}/${name}.json`]
    if (!load) throw new Error(`No mock file for ${lang}/${name}`)
    return (await load()) as ContentMap[K]
  }
  const res = await fetch(`${API_URL}/api/${name}?lang=${lang}`)
  if (!res.ok) throw new Error(`GET /api/${name} failed: ${res.status}`)
  return res.json()
}
