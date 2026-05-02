import { Hono } from 'hono'
import type { AppBindings } from '../env.js'

/**
 * Proxy OpenWeatherMap cloud tiles. Requires OPENWEATHER_API_KEY.
 * If absent, returns 404 so the client can fall back to GIBS-only.
 *
 * Path: /api/weather/clouds/:z/:x/:y.png
 */

const route = new Hono<AppBindings>()

route.get('/clouds/:z/:x/:y', async (c) => {
  const apiKey = c.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    return c.json({ error: 'OpenWeatherMap key not configured' }, 404)
  }
  const { z, x, y } = c.req.param()
  const cleanY = y.replace(/\.png$/, '')
  const url = `https://tile.openweathermap.org/map/clouds_new/${z}/${x}/${cleanY}.png?appid=${apiKey}`

  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(`https://internal/weather/clouds/${z}/${x}/${cleanY}`, { method: 'GET' })
  let res = await cache.match(cacheKey)
  if (!res) {
    const upstream = await fetch(url, { cf: { cacheEverything: true, cacheTtl: 1800 } })
    if (!upstream.ok) {
      return c.json({ error: `OWM upstream ${upstream.status}` }, upstream.status as 400)
    }
    res = new Response(upstream.body, upstream)
    res.headers.set('Cache-Control', 'public, max-age=1800')
    res.headers.set('Access-Control-Allow-Origin', '*')
    c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()))
  }
  return res
})

export default route
