/**
 * Downloads a free-licensed photo for each id in scripts/photos.config.ts into
 * public/images/photos/<id>.<ext>, and writes the credits to src/config/photos.json and
 * public/images/photos/CREDITS.md.
 *
 * Only CC0, CC BY, CC BY-SA and public domain photos are used. Sources, in order: the pinned
 * observation or Commons file; the iNaturalist taxon photos; research-grade iNaturalist
 * observations in British Columbia, then anywhere; the Commons fallbacks. With no free photo
 * the id is skipped and the app keeps its text placeholder.
 *
 * Run: node scripts/fetch-photos.ts [--force] [--only=orca,humpback]
 * Photos already on disk (with an entry in photos.json) are skipped unless --force is given.
 */
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { PHOTOS, type PhotoSource } from './photos.config.ts'

type License = 'cc0' | 'cc-by' | 'cc-by-sa' | 'pd'
type Source = 'inaturalist' | 'commons'

export type PhotoEntry = {
  src: string
  width: number
  height: number
  license: License
  licenseUrl: string
  author: string
  credit: string
  sourceUrl: string
  source: Source
}

/** A chosen photo, before it is downloaded. */
type Pick = {
  imageUrl: string
  license: License
  licenseUrl: string
  author: string
  sourceUrl: string
  source: Source
  note: string
  /** From rank(): 0 is landscape and at least 1024 px wide. */
  rank?: number
}

type InatPhoto = {
  id: number
  license_code: string | null
  url: string
  attribution: string
  attribution_name?: string | null
  original_dimensions?: { width: number; height: number } | null
  hidden?: boolean
  flags?: unknown[]
}
type InatUser = { login: string; name?: string | null }
type InatObservation = {
  id: number
  user: InatUser
  photos: InatPhoto[]
  taxon?: { id: number; name: string; ancestor_ids?: number[] } | null
}
type InatTaxon = { id: number; name: string; taxon_photos: { photo: InatPhoto }[] }

type CommonsMeta = Record<string, { value: string } | undefined>
type CommonsPage = {
  title: string
  index?: number
  imageinfo?: {
    url: string
    descriptionurl: string
    width: number
    height: number
    thumburl?: string
    mime?: string
    extmetadata: CommonsMeta
  }[]
}

const UA = 'SEAsk-kiosk-photo-fetch/1.0 (Ocean Hackathon 2026)'
const INAT = 'https://api.inaturalist.org/v1'
const COMMONS = 'https://commons.wikimedia.org/w/api.php'
const BC_PLACE_ID = 7085
const GAP_MS = 1100 // iNaturalist asks for fewer than 60 requests a minute
const RETRIES = 4
const COMMONS_WIDTH = 1280

const OUT = new URL('../public/images/photos/', import.meta.url)
const JSON_FILE = new URL('../src/config/photos.json', import.meta.url)
const CREDITS_FILE = new URL('CREDITS.md', OUT)

const FREE: License[] = ['cc0', 'cc-by', 'cc-by-sa', 'pd']
const LICENSE_URLS: Record<License, string> = {
  cc0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'cc-by': 'https://creativecommons.org/licenses/by/4.0/',
  'cc-by-sa': 'https://creativecommons.org/licenses/by-sa/4.0/',
  pd: 'https://creativecommons.org/publicdomain/mark/1.0/',
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const exists = (url: URL) => access(url).then(() => true, () => false)
const isFree = (code: string | null | undefined): code is License => FREE.includes(code as License)

const lastRequest = new Map<string, number>()

/** GET with the User-Agent, at most one request per GAP_MS per service, retrying 429 and 5xx. */
async function get(url: string): Promise<Response> {
  const host = new URL(url).hostname
  const service = host.includes('inaturalist') ? 'inaturalist' : host
  for (let attempt = 1; ; attempt++) {
    const wait = (lastRequest.get(service) ?? 0) + GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequest.set(service, Date.now())
    const res = await fetch(url, { headers: { 'User-Agent': UA } }).catch(() => null)
    if (res?.ok) return res
    if (res && res.status < 500 && res.status !== 429) throw new Error(`${url}: HTTP ${res.status}`)
    if (attempt >= RETRIES) throw new Error(`${url}: ${res ? `HTTP ${res.status}` : 'network error'}`)
    const retryAfter = Number(res?.headers.get('retry-after')) || 0
    await sleep(Math.max(retryAfter * 1000, 5000 * attempt))
  }
}

const getJson = async <T>(url: string): Promise<T> => (await (await get(url)).json()) as T

/** Width, height and file extension of a JPEG or PNG. */
function imageInfo(b: Buffer): { width: number; height: number; ext: string } {
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG')
    return { ext: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++
        continue
      }
      const marker = b[i + 1]
      if (marker === 0xff) i++
      else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) i += 2
      else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { ext: 'jpg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
      else i += 2 + b.readUInt16BE(i + 2)
    }
  }
  throw new Error('the download is not a JPEG or PNG')
}

/** Landscape and at least 1024 px wide first; the source order breaks ties. */
function rank(photo: InatPhoto): number {
  const d = photo.original_dimensions
  if (!d) return 3
  return (d.width > d.height ? 0 : 2) + (d.width >= 1024 ? 0 : 1)
}

const usable = (photo: InatPhoto) => isFree(photo.license_code) && !photo.hidden && !photo.flags?.length

/** "(c) Jane Doe, some rights reserved (CC BY), uploaded by …" → "Jane Doe". */
function inatAuthor(photo: InatPhoto, user?: InatUser): string {
  const m = photo.attribution
    .trim()
    .match(/^(?:\(c\)\s*)?(.+?),\s*(?:some rights reserved|no rights reserved|no known copyright restrictions)/i)
  return m?.[1].trim() || photo.attribution_name?.trim() || user?.name?.trim() || user?.login || 'unknown'
}

function inatPick(photo: InatPhoto, note: string, user?: InatUser): Pick {
  const license = photo.license_code as License
  return {
    imageUrl: photo.url.replace('/square.', '/large.'),
    license,
    licenseUrl: LICENSE_URLS[license],
    author: inatAuthor(photo, user),
    sourceUrl: `https://www.inaturalist.org/photos/${photo.id}`,
    source: 'inaturalist',
    note,
    rank: rank(photo),
  }
}

async function fromTaxonPhotos(taxonId: number, name?: string): Promise<Pick | null> {
  const { results } = await getJson<{ results: InatTaxon[] }>(`${INAT}/taxa/${taxonId}`)
  const taxon = results[0]
  if (!taxon) throw new Error(`iNaturalist has no taxon ${taxonId}`)
  if (name && taxon.name !== name) console.warn(`  warning: taxon ${taxonId} is ${taxon.name}, not ${name}`)
  const photos = taxon.taxon_photos.map((t) => t.photo).filter(usable)
  const best = photos.sort((a, b) => rank(a) - rank(b))[0]
  return best ? inatPick(best, `taxon ${taxonId} photo ${best.id}`) : null
}

async function fromObservations(taxonId: number, placeId?: number): Promise<Pick | null> {
  const params = new URLSearchParams({
    taxon_id: String(taxonId),
    photo_license: 'cc0,cc-by,cc-by-sa',
    quality_grade: 'research',
    order_by: 'votes',
    photos: 'true',
    per_page: '10',
  })
  if (placeId) params.set('place_id', String(placeId))
  const { results } = await getJson<{ results: InatObservation[] }>(`${INAT}/observations?${params}`)
  const candidates = results.flatMap((obs) =>
    obs.photos.map((photo, index) => ({ obs, photo, index })).filter(({ photo }) => usable(photo)),
  )
  const best = candidates.sort((a, b) => rank(a.photo) - rank(b.photo))[0]
  if (!best) return null
  const where = placeId ? 'BC observation' : 'observation'
  return inatPick(best.photo, `${where} ${best.obs.id} photo ${best.index}`, best.obs.user)
}

async function fromObservation(src: PhotoSource): Promise<Pick> {
  const id = src.observationId!
  const index = src.photoIndex ?? 0
  const { results } = await getJson<{ results: InatObservation[] }>(`${INAT}/observations/${id}`)
  const obs = results[0]
  const photo = obs?.photos[index]
  if (!photo) throw new Error(`observation ${id} has no photo ${index}`)
  if (!usable(photo)) throw new Error(`observation ${id} photo ${index} is ${photo.license_code ?? 'all rights reserved'}`)
  const t = obs.taxon
  if (src.taxonId && t && t.id !== src.taxonId && !t.ancestor_ids?.includes(src.taxonId))
    console.warn(`  warning: observation ${id} is ${t.name}, not taxon ${src.taxonId}`)
  return inatPick(photo, `pinned observation ${id} photo ${index}`, obs.user)
}

/** Strips tags and decodes the common HTML entities. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function commonsLicense(meta: CommonsMeta): License | null {
  if (meta.NonFree?.value === 'true') return null
  const code = (meta.License?.value ?? '').toLowerCase()
  const short = (meta.LicenseShortName?.value ?? '').toLowerCase()
  if (/^cc-by-sa-[\d.]+$/.test(code) || /^cc by-sa [\d.]+$/.test(short)) return 'cc-by-sa'
  if (/^cc-by-[\d.]+$/.test(code) || /^cc by [\d.]+$/.test(short)) return 'cc-by'
  if (code.startsWith('cc0') || short.startsWith('cc0')) return 'cc0'
  if (code === 'pd' || short.includes('public domain')) return 'pd'
  return null
}

/** The first free-licensed JPEG or PNG among the pages a Commons query returns. */
async function fromCommons(query: Record<string, string>, note: string): Promise<Pick | null> {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
    iiurlwidth: String(COMMONS_WIDTH),
    format: 'json',
    ...query,
  })
  const data = await getJson<{ query?: { pages: Record<string, CommonsPage> } }>(`${COMMONS}?${params}`)
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  for (const page of pages) {
    const info = page.imageinfo?.[0]
    if (!info || !/^image\/(jpeg|png|tiff)$/.test(info.mime ?? 'image/jpeg')) continue
    const license = commonsLicense(info.extmetadata)
    if (!license) continue
    const meta = info.extmetadata
    const author = plainText(meta.Artist?.value ?? '') || plainText(meta.Credit?.value ?? '') || 'unknown'
    const image = info.width > COMMONS_WIDTH && info.thumburl ? info.thumburl : info.url
    return {
      imageUrl: image.split('?')[0],
      license,
      licenseUrl: (meta.LicenseUrl?.value || LICENSE_URLS[license]).replace(/^http:/, 'https:'),
      author,
      sourceUrl: info.descriptionurl,
      source: 'commons',
      note: `${note} ${page.title}`,
    }
  }
  return null
}

const commonsFile = (file: string) => fromCommons({ titles: file }, 'Commons')
const commonsSearch = (text: string) =>
  fromCommons({ generator: 'search', gsrsearch: text, gsrnamespace: '6', gsrlimit: '20' }, `Commons search "${text}":`)

/**
 * Taxon photos, then BC observations, then all observations. Stops at the first landscape
 * photo at least 1024 px wide; otherwise returns the best-ranked one (earlier source on ties).
 */
async function fromTaxon(taxonId: number, name?: string): Promise<Pick | null> {
  const sources = [
    () => fromTaxonPhotos(taxonId, name),
    () => fromObservations(taxonId, BC_PLACE_ID),
    () => fromObservations(taxonId),
  ]
  let best: Pick | null = null
  for (const source of sources) {
    const pick = await source()
    if (pick && (!best || (pick.rank ?? 3) < (best.rank ?? 3))) best = pick
    if (best?.rank === 0) break
  }
  return best
}

/** Tries each source in order until one has a free photo. */
async function choose(src: PhotoSource): Promise<Pick | null> {
  if (src.observationId) return fromObservation(src)
  if (src.file) return commonsFile(src.file)
  const taxa = [...(src.taxonId ? [src.taxonId] : []), ...(src.fallbackTaxonIds ?? [])]
  for (const [i, taxonId] of taxa.entries()) {
    const pick = await fromTaxon(taxonId, i === 0 ? src.name : undefined)
    if (pick) return pick
    console.log(`  no free photo of taxon ${taxonId}`)
  }
  for (const file of src.commonsFallback ?? []) {
    const pick = await commonsFile(file)
    if (pick) return pick
  }
  return src.commonsSearch ? commonsSearch(src.commonsSearch) : null
}

function licenseLabel(license: License, licenseUrl: string): string {
  if (license === 'pd') return 'Public domain'
  if (license === 'cc0') return 'CC0'
  const version = licenseUrl.match(/\/(\d\.\d)(?=\/|$)/)?.[1] ?? '4.0'
  return `${license === 'cc-by' ? 'CC BY' : 'CC BY-SA'} ${version}`
}

const SOURCE_NAMES: Record<Source, string> = { inaturalist: 'iNaturalist', commons: 'Wikimedia Commons' }

function creditsMarkdown(entries: [string, PhotoEntry][]): string {
  const cell = (s: string) => s.replace(/\|/g, '\\|')
  const rows = entries.map(([id, e]) => {
    const file = e.src.split('/').pop()!
    const license = `[${licenseLabel(e.license, e.licenseUrl)}](${e.licenseUrl})`
    return `| ${id} (${file}) | ${cell(e.author)} | ${license} | [${SOURCE_NAMES[e.source]}](${e.sourceUrl}) |`
  })
  return [
    '# Photo credits',
    '',
    'Downloaded by `scripts/fetch-photos.ts` (do not edit by hand). The app shows the credit',
    'line from `src/config/photos.json` with each photo.',
    '',
    '| Photo | Author | Licence | Source |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
}

const args = process.argv.slice(2)
const force = args.includes('--force')
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean)
for (const id of only ?? []) if (!(id in PHOTOS)) throw new Error(`Unknown photo id "${id}". Use: ${Object.keys(PHOTOS).join(', ')}`)

const saved: Record<string, PhotoEntry> = await readFile(JSON_FILE, 'utf8').then(
  (text) => JSON.parse(text) as Record<string, PhotoEntry>,
  () => ({}),
)
const entries = new Map(Object.entries(saved).filter(([id]) => id in PHOTOS))
const skipped: string[] = []
await mkdir(OUT, { recursive: true })

for (const [id, src] of Object.entries(PHOTOS)) {
  if (only && !only.includes(id)) continue
  const old = entries.get(id)
  if (!force && old && (await exists(new URL(old.src.split('/').pop()!, OUT)))) {
    console.log(`${id}: on disk, skipped (use --force to download again)`)
    continue
  }
  try {
    const pick = await choose(src)
    if (!pick) {
      console.log(`${id}: no free-licensed photo found, skipped`)
      skipped.push(id)
      continue
    }
    const data = Buffer.from(await (await get(pick.imageUrl)).arrayBuffer())
    const { width, height, ext } = imageInfo(data)
    const file = `${id}.${ext}`
    if (old && old.src !== `/images/photos/${file}`) await rm(new URL(old.src.split('/').pop()!, OUT), { force: true })
    await writeFile(new URL(file, OUT), data)
    const author = src.author ?? pick.author
    entries.set(id, {
      src: `/images/photos/${file}`,
      width,
      height,
      license: pick.license,
      licenseUrl: pick.licenseUrl,
      author,
      credit: `Photo: ${author} · ${licenseLabel(pick.license, pick.licenseUrl)} · ${SOURCE_NAMES[pick.source]}`,
      sourceUrl: pick.sourceUrl,
      source: pick.source,
    })
    console.log(`${id}: ${pick.note} (${pick.license}, ${author}) → ${file} ${width}×${height}`)
  } catch (err) {
    console.log(`${id}: failed, skipped (${(err as Error).message})`)
    skipped.push(id)
  }
}

const sorted = [...entries].sort(([a], [b]) => a.localeCompare(b))
await writeFile(JSON_FILE, JSON.stringify(Object.fromEntries(sorted), null, 2) + '\n')
await writeFile(CREDITS_FILE, creditsMarkdown(sorted))
const missing = Object.keys(PHOTOS).filter((id) => !entries.has(id))
console.log(`Wrote ${sorted.length} photos to src/config/photos.json and public/images/photos/CREDITS.md`)
if (skipped.length) console.log(`Skipped this run: ${skipped.join(', ')}`)
if (missing.length) console.log(`No photo yet (the app keeps the placeholder): ${missing.join(', ')}`)
