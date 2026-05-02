import { Hono } from 'hono'
import type { AppBindings } from '../env.js'
import type { ActiveHurricane, StormCategory } from '@universe/shared'
import { cachedFetch, writeCache } from '../lib/cache.js'
import { fetchJson } from '../lib/http.js'

const HURR_TTL = 15 * 60

/**
 * NHC publishes a CurrentStorms.json with active Atlantic + East Pacific systems.
 * This feed is small and easy to parse; for forecast tracks we read each storm's
 * forecast advisory KMZ in a separate service in production. For this MVP we
 * surface positions, intensity, and basic forecast cone where present.
 *
 * Endpoint: https://www.nhc.noaa.gov/CurrentStorms.json
 */

const NHC_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json'

interface NhcResponse {
  activeStorms: NhcStorm[]
}

interface NhcStorm {
  id: string
  binNumber: string
  name: string
  classification: string
  intensity: string // wind kt as string
  pressure: string
  latitude: string
  longitude: string
  latitudeNumeric: number
  longitudeNumeric: number
  movementDir: number | null
  movementSpeed: number | null
  lastUpdate: string
  publicAdvisory?: { advNum?: string; issuance?: string; url?: string }
  forecastTrack?: { kmzFile?: string; zipFile?: string }
}

function classToCategory(cls: string, windKt: number): StormCategory {
  const c = cls.toUpperCase()
  if (c.includes('POST')) return 'PT'
  if (c.includes('EX')) return 'EX'
  if (c.includes('SUBTROP') && c.includes('DEP')) return 'SD'
  if (c.includes('SUBTROP')) return 'SS'
  if (c.includes('TROPICAL DEP') || c === 'TD') return 'TD'
  if (c.includes('TROPICAL STORM') || c === 'TS') return 'TS'
  if (c.includes('HURRICANE') || c === 'HU') {
    if (windKt >= 137) return 'HU5'
    if (windKt >= 113) return 'HU4'
    if (windKt >= 96) return 'HU3'
    if (windKt >= 83) return 'HU2'
    return 'HU1'
  }
  return 'TS'
}

function basinFromId(id: string): ActiveHurricane['basin'] {
  const prefix = id.slice(0, 2).toUpperCase()
  if (prefix === 'AL') return 'AL'
  if (prefix === 'EP') return 'EP'
  if (prefix === 'CP') return 'CP'
  if (prefix === 'WP') return 'WP'
  if (prefix === 'IO') return 'IO'
  if (prefix === 'SH') return 'SH'
  return 'AL'
}

function mapStorm(s: NhcStorm): ActiveHurricane {
  const windKt = parseFloat(s.intensity) || 0
  const pressure = parseFloat(s.pressure)
  // forecastTrack / pastTrack are intentionally omitted: the NHC CurrentStorms
  // feed does not include them, and the KMZ-parsing pipeline that would fill
  // them isn't wired yet. Future implementation should populate via the KMZ
  // referenced in `s.forecastTrack`.
  return {
    id: s.id,
    name: s.name,
    basin: basinFromId(s.id),
    position: { lat: s.latitudeNumeric, lon: s.longitudeNumeric },
    movementDeg: s.movementDir ?? undefined,
    movementKt: s.movementSpeed ?? undefined,
    windKt,
    pressureMb: Number.isFinite(pressure) ? pressure : undefined,
    category: classToCategory(s.classification, windKt),
    advisoryAt: s.lastUpdate,
    source: 'NHC',
  }
}

const route = new Hono<AppBindings>()

route.get('/', async (c) => {
  const env = await cachedFetch<ActiveHurricane[]>(c, {
    key: 'hurricanes:active:v1',
    ttlSeconds: HURR_TTL,
    source: 'NOAA NHC',
    fetcher: async () => {
      try {
        const raw = await fetchJson<NhcResponse>(NHC_URL)
        return (raw.activeStorms || []).map(mapStorm)
      } catch (err) {
        console.error('[hurricanes] NHC fetch failed:', err)
        return []
      }
    },
  })
  return c.json(env)
})

export default route

export async function refreshHurricaneCache(env: { UNVERSE_CACHE: KVNamespace }) {
  try {
    const raw = await fetchJson<NhcResponse>(NHC_URL)
    const data = (raw.activeStorms || []).map(mapStorm)
    await writeCache(env.UNVERSE_CACHE, 'hurricanes:active:v1', data, HURR_TTL, 'NOAA NHC')
  } catch (err) {
    console.error('[cron] hurricanes refresh failed:', err)
  }
}
