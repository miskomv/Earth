/** Fetch with timeout and JSON parsing. Throws on non-OK. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12_000,
): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} from ${url}: ${body.slice(0, 200)}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch as text (TLEs, KML, etc.). */
export async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12_000,
): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} from ${url}: ${body.slice(0, 200)}`)
    }
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}
