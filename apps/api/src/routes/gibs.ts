import { Hono } from 'hono'
import type { AppBindings } from '../env.js'

/**
 * Proxy NASA GIBS WMTS tiles. We avoid CORS issues and let CF cache the binary
 * responses at the edge. We do NOT use KV here (binary tiles + 25MB limits) —
 * we use the Cloudflare cache API.
 *
 * Path: /api/gibs/:layer/:date/:z/:y/:x.jpg
 * Example layer: MODIS_Terra_CorrectedReflectance_TrueColor
 */

const route = new Hono<AppBindings>()

const ALLOWED_LAYERS = new Set([
  'MODIS_Terra_CorrectedReflectance_TrueColor',
  'MODIS_Aqua_CorrectedReflectance_TrueColor',
  'VIIRS_SNPP_CorrectedReflectance_TrueColor',
  'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
  'BlueMarble_NextGeneration',
  'BlueMarble_ShadedRelief',
  'VIIRS_Black_Marble',
])

route.get('/:layer/:date/:z/:y/:x', async (c) => {
  const { layer, date, z, y, x } = c.req.param()
  const ext = c.req.path.endsWith('.png') ? 'png' : 'jpg'
  if (!ALLOWED_LAYERS.has(layer)) {
    return c.json({ error: 'Unknown GIBS layer' }, 400)
  }
  const cleanX = x.replace(/\.(png|jpg)$/, '')
  const url =
    `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/default/${date}` +
    `/250m/${z}/${y}/${cleanX}.${ext}`

  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(url, { method: 'GET' })
  let res = await cache.match(cacheKey)
  if (!res) {
    const upstream = await fetch(url, { cf: { cacheEverything: true, cacheTtl: 86400 } })
    if (!upstream.ok) {
      return c.json({ error: `GIBS upstream ${upstream.status}` }, upstream.status as 400)
    }
    res = new Response(upstream.body, upstream)
    res.headers.set('Cache-Control', 'public, max-age=86400, immutable')
    res.headers.set('Access-Control-Allow-Origin', '*')
    c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()))
  }
  return res
})

export default route
