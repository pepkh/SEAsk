/*
 * Questions and answers for the crew "Ask the bridge" panel and the passenger diver.
 *
 * Today the answers are canned (mockProvider). The provider interface is what a real assistant will
 * implement later (POST /api/ask: an LLM answering with tool calls over the /bridge/* data), with no
 * change to the panels.
 */

export type QaPersona = 'crew' | 'guide'

export interface QaItem {
  id: string
  question: string
  /** Answer with `{placeholders}` filled from QaContext.values */
  answer: string
  /** Used when a placeholder of `answer` has no value (also with placeholders) */
  fallback?: string
  /** Where the answer comes from, shown as chips; may hold placeholders */
  sources?: string[]
  /** Extra words that match a typed question to this item */
  keywords?: string[]
}

export interface QaContext {
  /** Values for the placeholders; null when not known at this moment */
  values: Record<string, string | null>
}

export interface QaAnswer {
  /** The matched item, or null when nothing matched */
  id: string | null
  question: string
  text: string
  sources: string[]
}

export interface QaProvider {
  ask(question: QaItem | string, items: QaItem[], ctx: QaContext): Promise<QaAnswer>
}
