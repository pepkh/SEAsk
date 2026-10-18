import type { QaAnswer, QaContext, QaItem, QaProvider } from './types'

const PLACEHOLDER = /\{(\w+)\}/g

/** `template` with its placeholders filled, or null when one has no value. */
function fill(template: string, values: QaContext['values']): string | null {
  let missing = false
  const text = template.replace(PLACEHOLDER, (_, name: string) => {
    const v = values[name]
    if (v === null || v === undefined || v === '') {
      missing = true
      return '—'
    }
    return v
  })
  return missing ? null : text
}

const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'what', 'whats', 'how', 'why', 'does', 'do', 'it', 'here', 'to', 'of', 'in', 'and', 'any', 'there', 'today', 'me', 'i', 'you', 'on', 'at', 'for', 'this', 'that', 'est', 'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'pourquoi', 'quoi', 'ici'])

const words = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9₂ ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))

/** The canned item that best matches a typed question (shared words), or null. */
export function matchItem(text: string, items: QaItem[]): QaItem | null {
  const asked = new Set(words(text))
  let best: QaItem | null = null
  let bestScore = 0
  for (const item of items) {
    const vocab = new Set([...words(item.question), ...(item.keywords ?? []).flatMap(words)])
    let score = 0
    for (const w of asked) if (vocab.has(w)) score++
    if (score > bestScore) {
      best = item
      bestScore = score
    }
  }
  return bestScore > 0 ? best : null
}

/** Canned answers filled with the values at the moment of asking. No network, no model. */
export function createMockProvider(noMatch: string): QaProvider {
  return {
    async ask(question, items, ctx): Promise<QaAnswer> {
      const typed = typeof question === 'string'
      const item = typed ? matchItem(question, items) : question
      const asked = typed ? question : question.question
      if (!item) return { id: null, question: asked, text: noMatch, sources: [] }
      const text = fill(item.answer, ctx.values) ?? (item.fallback ? fill(item.fallback, ctx.values) ?? item.fallback.replace(PLACEHOLDER, '—') : item.answer.replace(PLACEHOLDER, '—'))
      const sources = (item.sources ?? []).map((s) => fill(s, ctx.values) ?? s.replace(PLACEHOLDER, '').trim())
      return { id: item.id, question: asked, text, sources }
    },
  }
}
