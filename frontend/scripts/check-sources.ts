/**
 * Checks that every written fact the kiosk shows has an entry in src/mocks/common/content-sources.json (keys: see
 * src/hooks/contentSources.ts), and counts the entries with no source or not yet checked by a person.
 *
 * Run: node scripts/check-sources.ts
 * Exits with 1 when a fact has no entry, or an entry belongs to no fact.
 */
import { readFile } from 'node:fs/promises'

const read = async (path: string) => JSON.parse(await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8'))

type Entry = { sources: { name: string; url: string }[]; checked: boolean }
const sources: Record<string, Entry> = await read('mocks/common/content-sources.json')
const species = await read('mocks/en/species.json')
const quiz = await read('mocks/en/quiz.json')
const seafloor = await read('mocks/en/seafloor.json')
const zones = await read('mocks/en/zones.json')
const guide = await read('mocks/en/guide-qa.json')
const landmarkText = await read('mocks/en/landmarks.json')
const { landmarks }: { landmarks: { id: string; elevationM?: number }[] } = await read('config/landmarks.json')

// The keys the screens look up (FactSource / factSourceText calls)
const expected = [
  ...species.items.map((s: { id: string }) => `species.${s.id}`),
  ...quiz.questions.map((_: unknown, i: number) => `quiz.${i}`),
  ...seafloor.facts.map((_: unknown, i: number) => `seafloor.facts.${i}`),
  'seafloor.markers',
  ...Object.keys(zones).flatMap((z) => [`zones.${z}.happening`, `zones.${z}.lookout`]),
  ...guide.items.map((q: { id: string }) => `guide.${q.id}`),
  'tides.explainer',
  ...Object.keys(landmarkText).map((id) => `landmarks.${id}.fact`),
  ...landmarks.filter((l) => l.elevationM).map((l) => `landmarks.${l.id}.elevation`),
]

const missing = expected.filter((key) => !sources[key])
const unknown = Object.keys(sources).filter((key) => !expected.includes(key))
const unsourced = expected.filter((key) => sources[key] && !sources[key].sources.length)
const checked = expected.filter((key) => sources[key]?.checked).length

console.log(`${expected.length} facts: ${expected.length - missing.length} with an entry, ${unsourced.length} of them with no source yet, ${checked} checked by a person.`)
for (const key of missing) console.log(`  missing: ${key}`)
for (const key of unsourced) console.log(`  no source: ${key}`)
for (const key of unknown) console.log(`  no such fact: ${key}`)
if (missing.length || unknown.length) process.exit(1)
