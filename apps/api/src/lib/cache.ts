import type { Context } from 'hono'
import type { AppBindings } from '../env.js'
import type { ApiEnvelope } from '@universe/shared'

interface CacheRecord<T> {
  data: T
  cachedAt: string
  ttlSeconds: number
  source: string
}

interface FetchOptions<T> {
  key: string
  ttlSeconds: number
  source: string
  fetcher: () => Promise<T>
  /**
   * If true, return stale data while refreshing in the background.
   * Default: true.
   */
  staleWhileRevalidate?: boolean
  /**
   * Soft TTL after which we still serve cached data but trigger a refresh.
   * Defaults to ttlSeconds.
   */
  softTtlSeconds?: number
}

/**
 * Fetch with KV cache. Stale-while-revalidate enabled by default; the cache
 * key holds the value past its soft TTL up to its hard expiration so we can
 * still answer instantly while the cron (or this request) refreshes it.
 */
export async function cachedFetch<T>(
  c: Context<AppBindings>,
  opts: FetchOptions<T>,
): Promise<ApiEnvelope<T>> {
  const swr = opts.staleWhileRevalidate ?? true
  const softTtl = opts.softTtlSeconds ?? opts.ttlSeconds
  const hardTtl = swr ? Math.max(opts.ttlSeconds * 4, opts.ttlSeconds + 3600) : opts.ttlSeconds

  const cached = await c.env.UNVERSE_CACHE.get<CacheRecord<T>>(opts.key, 'json')
  const now = Date.now()

  if (cached) {
    const ageSec = (now - new Date(cached.cachedAt).getTime()) / 1000
    if (ageSec < softTtl) {
      return envelopeFrom(cached)
    }
    if (swr) {
      // Serve stale, refresh in background. A failure here doesn't affect
      // the response we just returned, so log at warn (not error): typical
      // causes are transient upstream timeouts that recover on the next tick.
      c.executionCtx.waitUntil(
        refreshCache(c, opts, hardTtl).catch((err) => {
          console.warn(`[cache] background refresh failed for ${opts.key}:`, String(err))
        }),
      )
      return envelopeFrom(cached)
    }
  }

  const fresh = await refreshCache(c, opts, hardTtl)
  return envelopeFrom(fresh)
}

async function refreshCache<T>(
  c: Context<AppBindings>,
  opts: FetchOptions<T>,
  hardTtl: number,
): Promise<CacheRecord<T>> {
  const data = await opts.fetcher()
  const record: CacheRecord<T> = {
    data,
    cachedAt: new Date().toISOString(),
    ttlSeconds: opts.ttlSeconds,
    source: opts.source,
  }
  await c.env.UNVERSE_CACHE.put(opts.key, JSON.stringify(record), {
    expirationTtl: hardTtl,
  })
  return record
}

function envelopeFrom<T>(rec: CacheRecord<T>): ApiEnvelope<T> {
  return {
    data: rec.data,
    cachedAt: rec.cachedAt,
    ttlSeconds: rec.ttlSeconds,
    source: rec.source,
  }
}

/**
 * Standalone cache write used by scheduled handlers (no Context available).
 */
export async function writeCache<T>(
  kv: KVNamespace,
  key: string,
  data: T,
  ttlSeconds: number,
  source: string,
): Promise<void> {
  const record: CacheRecord<T> = {
    data,
    cachedAt: new Date().toISOString(),
    ttlSeconds,
    source,
  }
  const hardTtl = Math.max(ttlSeconds * 4, ttlSeconds + 3600)
  await kv.put(key, JSON.stringify(record), { expirationTtl: hardTtl })
}
