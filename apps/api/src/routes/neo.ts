import { Hono } from 'hono'
import type { AppBindings } from '../env.js'
import type { NearEarthObject, NeoFeedResponse } from '@universe/shared'
import { cachedFetch } from '../lib/cache.js'
import { fetchJson } from '../lib/http.js'

const NEO_TTL = 6 * 3600 // 6h

interface NasaNeoFeed {
  element_count: number
  near_earth_objects: Record<string, NasaNeoObject[]>
}

interface NasaNeoObject {
  id: string
  neo_reference_id: string
  name: string
  nasa_jpl_url: string
  absolute_magnitude_h: number
  estimated_diameter: {
    meters: { estimated_diameter_min: number; estimated_diameter_max: number }
  }
  is_potentially_hazardous_asteroid: boolean
  is_sentry_object: boolean
  close_approach_data: NasaCloseApproach[]
}

interface NasaCloseApproach {
  close_approach_date_full: string
  epoch_date_close_approach: number
  relative_velocity: { kilometers_per_second: string }
  miss_distance: { kilometers: string; lunar: string }
  orbiting_body: string
}

const route = new Hono<AppBindings>()

// NASA NeoWs requires a non-empty `api_key`. We bake `DEMO_KEY` into the
// query — anonymous, rate-limited to ~30 req/h per IP, but our 6 h KV
// cache + cron pre-warm keeps the miss rate to a handful of upstream
// calls per day, well within budget.
const NASA_API_KEY = 'DEMO_KEY'

route.get('/feed', async (c) => {
  const today = new Date()
  const start = today.toISOString().slice(0, 10)
  const end = new Date(today.getTime() + 6 * 86400_000).toISOString().slice(0, 10)

  const env = await cachedFetch<NeoFeedResponse>(c, {
    key: `neo:feed:${start}:${end}`,
    ttlSeconds: NEO_TTL,
    source: 'NASA NeoWs',
    fetcher: async () => {
      const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${start}&end_date=${end}&api_key=${NASA_API_KEY}`
      const raw = await fetchJson<NasaNeoFeed>(url)
      const objects: NearEarthObject[] = []
      for (const list of Object.values(raw.near_earth_objects)) {
        for (const o of list) {
          const ca = o.close_approach_data[0]
          if (!ca) continue
          objects.push({
            id: o.id,
            neoReferenceId: o.neo_reference_id,
            name: o.name,
            nasaJplUrl: o.nasa_jpl_url,
            absoluteMagnitudeH: o.absolute_magnitude_h,
            estimatedDiameterMetersMin: o.estimated_diameter.meters.estimated_diameter_min,
            estimatedDiameterMetersMax: o.estimated_diameter.meters.estimated_diameter_max,
            isPotentiallyHazardous: o.is_potentially_hazardous_asteroid,
            isSentryObject: o.is_sentry_object,
            closeApproach: {
              date: new Date(ca.epoch_date_close_approach).toISOString(),
              epochUnixMs: ca.epoch_date_close_approach,
              relativeVelocityKmS: parseFloat(ca.relative_velocity.kilometers_per_second),
              missDistanceKm: parseFloat(ca.miss_distance.kilometers),
              missDistanceLunar: parseFloat(ca.miss_distance.lunar),
              orbitingBody: ca.orbiting_body,
            },
          })
        }
      }
      objects.sort((a, b) => a.closeApproach.epochUnixMs - b.closeApproach.epochUnixMs)
      return {
        startDate: start,
        endDate: end,
        count: objects.length,
        objects,
      }
    },
  })

  return c.json(env)
})

export default route

export async function refreshNeoCache(env: { UNVERSE_CACHE: KVNamespace }) {
  const today = new Date()
  const start = today.toISOString().slice(0, 10)
  const end = new Date(today.getTime() + 6 * 86400_000).toISOString().slice(0, 10)
  const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${start}&end_date=${end}&api_key=${NASA_API_KEY}`
  const raw = await fetchJson<NasaNeoFeed>(url)
  const objects: NearEarthObject[] = []
  for (const list of Object.values(raw.near_earth_objects)) {
    for (const o of list) {
      const ca = o.close_approach_data[0]
      if (!ca) continue
      objects.push({
        id: o.id,
        neoReferenceId: o.neo_reference_id,
        name: o.name,
        nasaJplUrl: o.nasa_jpl_url,
        absoluteMagnitudeH: o.absolute_magnitude_h,
        estimatedDiameterMetersMin: o.estimated_diameter.meters.estimated_diameter_min,
        estimatedDiameterMetersMax: o.estimated_diameter.meters.estimated_diameter_max,
        isPotentiallyHazardous: o.is_potentially_hazardous_asteroid,
        isSentryObject: o.is_sentry_object,
        closeApproach: {
          date: new Date(ca.epoch_date_close_approach).toISOString(),
          epochUnixMs: ca.epoch_date_close_approach,
          relativeVelocityKmS: parseFloat(ca.relative_velocity.kilometers_per_second),
          missDistanceKm: parseFloat(ca.miss_distance.kilometers),
          missDistanceLunar: parseFloat(ca.miss_distance.lunar),
          orbitingBody: ca.orbiting_body,
        },
      })
    }
  }
  objects.sort((a, b) => a.closeApproach.epochUnixMs - b.closeApproach.epochUnixMs)
  const data: NeoFeedResponse = {
    startDate: start,
    endDate: end,
    count: objects.length,
    objects,
  }
  const { writeCache } = await import('../lib/cache.js')
  await writeCache(env.UNVERSE_CACHE, `neo:feed:${start}:${end}`, data, NEO_TTL, 'NASA NeoWs')
}
