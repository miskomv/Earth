import { Hono } from 'hono'
import type { AppBindings } from '../env.js'
import type { Earthquake } from '@universe/shared'
import { cachedFetch, writeCache } from '../lib/cache.js'
import { fetchJson } from '../lib/http.js'

const QUAKE_TTL = 5 * 60 // 5min

interface UsgsFeature {
  id: string
  properties: {
    mag: number
    place: string
    time: number
    updated: number
    url: string
    felt: number | null
    tsunami: number
    type: string
    alert: string | null
    title: string
  }
  geometry: {
    type: 'Point'
    coordinates: [number, number, number] // lon, lat, depth km
  }
}

interface UsgsFeed {
  type: 'FeatureCollection'
  metadata: { generated: number; title: string }
  features: UsgsFeature[]
}

const FEED_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'

function mapFeature(f: UsgsFeature): Earthquake | null {
  const [lon, lat, depth] = f.geometry.coordinates
  if (typeof lon !== 'number' || typeof lat !== 'number') return null
  return {
    id: f.id,
    magnitude: f.properties.mag,
    place: f.properties.place,
    time: new Date(f.properties.time).toISOString(),
    epochUnixMs: f.properties.time,
    position: { lat, lon, altKm: -depth },
    depthKm: depth,
    url: f.properties.url,
    felt: f.properties.felt ?? undefined,
    tsunami: !!f.properties.tsunami,
    type: f.properties.type,
    alert: (f.properties.alert as Earthquake['alert']) ?? null,
  }
}

const route = new Hono<AppBindings>()

route.get('/', async (c) => {
  const env = await cachedFetch<Earthquake[]>(c, {
    key: 'quakes:m25:1d:v1',
    ttlSeconds: QUAKE_TTL,
    source: 'USGS',
    fetcher: async () => {
      const raw = await fetchJson<UsgsFeed>(FEED_URL)
      return raw.features
        .map(mapFeature)
        .filter((q): q is Earthquake => q !== null)
        .sort((a, b) => b.epochUnixMs - a.epochUnixMs)
    },
  })
  return c.json(env)
})

export default route

export async function refreshQuakeCache(env: { UNVERSE_CACHE: KVNamespace }) {
  try {
    const raw = await fetchJson<UsgsFeed>(FEED_URL)
    const data = raw.features
      .map(mapFeature)
      .filter((q): q is Earthquake => q !== null)
      .sort((a, b) => b.epochUnixMs - a.epochUnixMs)
    await writeCache(env.UNVERSE_CACHE, 'quakes:m25:1d:v1', data, QUAKE_TTL, 'USGS')
  } catch (err) {
    console.error('[cron] quakes refresh failed:', err)
  }
}
