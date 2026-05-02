import { Hono } from 'hono'
import type { AppBindings } from '../env.js'
import type { TleEntry, TleGroup } from '@universe/shared'
import { cachedFetch, writeCache } from '../lib/cache.js'
import { fetchText } from '../lib/http.js'

const TLE_TTL = 3 * 3600 // 3h

const ALLOWED_GROUPS: ReadonlySet<TleGroup> = new Set([
  'stations',
  'active',
  'starlink',
  'gps-ops',
  'galileo',
  'weather',
  'science',
  'geo',
  'visual',
])

function celestrakUrl(group: TleGroup): string {
  return `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`
}

/** Parse a 3LE block (name + 2 lines) into TleEntry list. */
function parseTle(text: string, group: TleGroup): TleEntry[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean)
  const out: TleEntry[] = []
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i]!.trim()
    const l1 = lines[i + 1]!
    const l2 = lines[i + 2]!
    if (!l1.startsWith('1 ') || !l2.startsWith('2 ')) continue
    const noradId = parseInt(l1.slice(2, 7).trim(), 10)
    if (Number.isNaN(noradId)) continue
    out.push({ name, line1: l1, line2: l2, noradId, group })
  }
  return out
}

const route = new Hono<AppBindings>()

route.get('/:group', async (c) => {
  const group = c.req.param('group') as TleGroup
  if (!ALLOWED_GROUPS.has(group)) {
    return c.json({ error: 'Unknown group', allowed: [...ALLOWED_GROUPS] }, 400)
  }

  // Hard-cap returned count for very large groups to keep payload sane.
  const limit = parseInt(c.req.query('limit') ?? '0', 10)

  const env = await cachedFetch<TleEntry[]>(c, {
    key: `tle:${group}`,
    ttlSeconds: TLE_TTL,
    source: 'CelesTrak',
    fetcher: async () => {
      const text = await fetchText(celestrakUrl(group))
      return parseTle(text, group)
    },
  })

  const data = limit > 0 ? env.data.slice(0, limit) : env.data
  return c.json({ ...env, data })
})

export default route

export async function refreshTleCache(env: { UNVERSE_CACHE: KVNamespace }) {
  // Stations + visual hand-picked common stuff. Extend as needed.
  const groups: TleGroup[] = ['stations', 'visual']
  for (const group of groups) {
    try {
      const text = await fetchText(celestrakUrl(group))
      const entries = parseTle(text, group)
      await writeCache(env.UNVERSE_CACHE, `tle:${group}`, entries, TLE_TTL, 'CelesTrak')
    } catch (err) {
      console.error(`[cron] TLE refresh failed for ${group}:`, err)
    }
  }
}
