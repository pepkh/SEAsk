import type { Lang } from '../i18n/LanguageContext'
import type { ContentMap, ContentName } from '../types/content'

const content = import.meta.glob<unknown>('../mocks/{en,fr}/*.json', { import: 'default' })

/** Static content (zones, species, quiz, landmarks…), bundled with the app in src/mocks/{lang}. */
export async function getContent<K extends ContentName>(name: K, lang: Lang): Promise<ContentMap[K]> {
  const load = content[`../mocks/${lang}/${name}.json`]
  if (!load) throw new Error(`No content file for ${lang}/${name}`)
  return (await load()) as ContentMap[K]
}
