import { Hono } from 'hono'
import type { AppBindings } from '../env.js'
import type { SmallBody } from '@universe/shared'
import { cachedFetch } from '../lib/cache.js'
import { fetchJson } from '../lib/http.js'

const SBDB_TTL = 24 * 3600 // 24h

interface SbdbResponse {
  object: {
    spkid: string
    fullname: string
    shortname?: string
    kind: 'an' | 'au' | 'cn' | 'cu' // 'an' asteroid numbered, 'cn' comet numbered
    neo: boolean
    pha: boolean
    orbit_class?: { name?: string }
  }
  orbit?: {
    epoch: string
    elements: Array<{ name: string; value: string; units?: string }>
  }
  phys_par?: Array<{ name: string; value: string; units?: string }>
}

function isAsteroid(kind: string): boolean {
  return kind === 'an' || kind === 'au'
}

function elValue(orbit: SbdbResponse['orbit'], name: string): number | undefined {
  const el = orbit?.elements.find((e) => e.name === name)
  if (!el) return undefined
  const n = parseFloat(el.value)
  return Number.isFinite(n) ? n : undefined
}

function physValue(phys: SbdbResponse['phys_par'], name: string): number | undefined {
  const p = phys?.find((e) => e.name === name)
  if (!p) return undefined
  const n = parseFloat(p.value)
  return Number.isFinite(n) ? n : undefined
}

const route = new Hono<AppBindings>()

route.get('/:designation', async (c) => {
  const designation = c.req.param('designation')
  const env = await cachedFetch<SmallBody>(c, {
    key: `sbdb:${designation.toLowerCase()}`,
    ttlSeconds: SBDB_TTL,
    source: 'JPL Small-Body Database',
    fetcher: async () => {
      const url = `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(designation)}&full-prec=1&phys-par=1`
      const raw = await fetchJson<SbdbResponse>(url)
      const a = elValue(raw.orbit, 'a')
      const e = elValue(raw.orbit, 'e')
      const i = elValue(raw.orbit, 'i')
      const om = elValue(raw.orbit, 'om')
      const w = elValue(raw.orbit, 'w')
      const ma = elValue(raw.orbit, 'ma')
      const n = elValue(raw.orbit, 'n')
      const epochStr = raw.orbit?.epoch
      const epoch = epochStr ? parseFloat(epochStr) : NaN
      if (
        a === undefined ||
        e === undefined ||
        i === undefined ||
        om === undefined ||
        w === undefined ||
        ma === undefined ||
        !Number.isFinite(epoch)
      ) {
        throw new Error(`Incomplete orbit elements for ${designation}`)
      }
      const sb: SmallBody = {
        spkid: raw.object.spkid,
        fullname: raw.object.fullname,
        shortname: raw.object.shortname,
        kind: isAsteroid(raw.object.kind) ? 'asteroid' : 'comet',
        isPha: raw.object.pha,
        isNeo: raw.object.neo,
        diameterKm: physValue(raw.phys_par, 'diameter'),
        albedo: physValue(raw.phys_par, 'albedo'),
        elements: { a, e, i, om, w, ma, epoch, n },
        orbitClass: raw.object.orbit_class?.name,
        fetchedAt: new Date().toISOString(),
      }
      return sb
    },
  })
  return c.json(env)
})

/** Curated list of well-known bodies for the visualization to render by default. */
route.get('/', async (c) => {
  const list = [
    '433',     // Eros
    '99942',   // Apophis
    '101955',  // Bennu
    '162173',  // Ryugu
    '25143',   // Itokawa
    '1',       // Ceres
    '2',       // Pallas
    '4',       // Vesta
    '4179',    // Toutatis
    '1566',    // Icarus
    '1862',    // Apollo
    '2062',    // Aten
    '3200',    // Phaethon
    '4769',    // Castalia
    '1P',      // Halley
    '2P',      // Encke
    '67P',     // Churyumov-Gerasimenko
  ]
  const env = await cachedFetch<SmallBody[]>(c, {
    key: `sbdb:curated:v2`,
    ttlSeconds: SBDB_TTL,
    source: 'JPL SBDB (curated)',
    fetcher: async () => {
      // Parallelize per-body fetches; without this, 17 sequential calls each
      // up to 12 s timeout could push request CPU well past Workers limits
      // and saturate the subrequest budget on cold-start.
      const results = await Promise.allSettled(
        list.map(async (designation) => {
          const url = `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(designation)}&full-prec=1&phys-par=1`
          const raw = await fetchJson<SbdbResponse>(url)
          const a = elValue(raw.orbit, 'a')
          const e = elValue(raw.orbit, 'e')
          const i = elValue(raw.orbit, 'i')
          const om = elValue(raw.orbit, 'om')
          const w = elValue(raw.orbit, 'w')
          const ma = elValue(raw.orbit, 'ma')
          const n = elValue(raw.orbit, 'n')
          const epoch = parseFloat(raw.orbit?.epoch ?? 'NaN')
          if (
            a === undefined ||
            e === undefined ||
            i === undefined ||
            om === undefined ||
            w === undefined ||
            ma === undefined ||
            !Number.isFinite(epoch)
          ) {
            return null
          }
          const sb: SmallBody = {
            spkid: raw.object.spkid,
            fullname: raw.object.fullname,
            shortname: raw.object.shortname,
            kind: isAsteroid(raw.object.kind) ? 'asteroid' : 'comet',
            isPha: raw.object.pha,
            isNeo: raw.object.neo,
            diameterKm: physValue(raw.phys_par, 'diameter'),
            albedo: physValue(raw.phys_par, 'albedo'),
            elements: { a, e, i, om, w, ma, epoch, n },
            orbitClass: raw.object.orbit_class?.name,
            fetchedAt: new Date().toISOString(),
          }
          return sb
        }),
      )
      const out: SmallBody[] = []
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) out.push(r.value)
        else if (r.status === 'rejected') console.error('[sbdb] curated:', r.reason)
      }
      return out
    },
  })
  return c.json(env)
})

export default route
