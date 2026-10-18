import { API_URL } from '../config/env'

/** Where a bridge dataset came from: the backend, or the offline copy in public/data. */
export type PartSource = 'api' | 'snapshot'

export interface Loaded<T> {
  data: T
  source: PartSource
}

/** Whole days are up to ~1 MB of JSON (gzipped ~0.25 MB). */
const TIMEOUT_MS = 20_000

/**
 * One bridge dataset: the backend first, then the snapshot written by
 * backend/scripts/export_bridge_snapshot.py into public/data/{date}/{file}.json. Null when neither
 * has it. `path` is the API path, `file` the snapshot name.
 */
export async function loadPart<T>(path: string, file: string, date: string): Promise<Loaded<T> | null> {
  try {
    return { data: await fetchJson<T>(`${API_URL}${path}`), source: 'api' }
  } catch (err) {
    console.warn(`Bridge: ${path} unavailable, trying the offline copy.`, err)
  }
  try {
    return { data: await loadSnapshot<T>(date, file), source: 'snapshot' }
  } catch {
    return null
  }
}

/** The offline copy of one bridge dataset: public/data/{date}/{file}.json. */
export const loadSnapshot = <T>(date: string, file: string) => fetchJson<T>(`/data/${date}/${file}.json`)

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`)
  // The Vite dev server answers a missing public file with 200 and the HTML page.
  if (!res.headers.get('content-type')?.includes('json')) throw new Error(`GET ${url}: not JSON`)
  return (await res.json()) as T
}
