import { API_URL } from '../config/env'

/** A backend answer that is not 2xx. */
export class ApiError extends Error {
  status: number

  constructor(path: string, status: number) {
    super(`GET ${path} failed: ${status}`)
    this.status = status
  }
}

/** GET a backend JSON endpoint. Rejects with ApiError on a non-2xx answer, or on the timeout. */
export async function getJson<T>(path: string, timeoutMs: number): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new ApiError(path, res.status)
  return (await res.json()) as T
}
