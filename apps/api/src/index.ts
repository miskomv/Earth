import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { AppBindings, Env } from './env.js'

import neoRoute, { refreshNeoCache } from './routes/neo.js'
import tleRoute, { refreshTleCache } from './routes/tle.js'
import sbdbRoute from './routes/sbdb.js'
import quakesRoute, { refreshQuakeCache } from './routes/quakes.js'
import hurricanesRoute, { refreshHurricaneCache } from './routes/hurricanes.js'
import gibsRoute from './routes/gibs.js'
import weatherRoute from './routes/weather.js'

const app = new Hono<AppBindings>()

app.use('*', logger())
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const allowed = c.env.ALLOWED_ORIGINS || '*'
      if (allowed === '*' || !origin) return origin || '*'
      const host = origin.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      // Each entry in ALLOWED_ORIGINS is treated as a hostname; a request
      // matches if its origin host is exactly that entry OR a subdomain of
      // it. This lets one rule (`your-site.pages.dev`) cover both the
      // canonical Pages URL and every per-deployment preview URL like
      // `<hash>.your-site.pages.dev`.
      const list = allowed.split(',').map((s: string) => s.trim()).filter(Boolean)
      for (const pattern of list) {
        if (host === pattern || host.endsWith('.' + pattern)) return origin
      }
      return null
    },
    allowMethods: ['GET', 'OPTIONS'],
    maxAge: 86400,
  }),
)

app.get('/', (c) =>
  c.json({
    name: 'universe-api',
    version: '0.1.0',
    endpoints: [
      'GET /api/neo/feed',
      'GET /api/tle/:group',
      'GET /api/sbdb',
      'GET /api/sbdb/:designation',
      'GET /api/quakes',
      'GET /api/hurricanes',
      'GET /api/gibs/:layer/:date/:z/:y/:x  (the :x segment may include .jpg or .png)',
      'GET /api/weather/clouds/:z/:x/:y    (the :y segment may include .png)',
    ],
  }),
)

app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

app.route('/api/neo', neoRoute)
app.route('/api/tle', tleRoute)
app.route('/api/sbdb', sbdbRoute)
app.route('/api/quakes', quakesRoute)
app.route('/api/hurricanes', hurricanesRoute)
app.route('/api/gibs', gibsRoute)
app.route('/api/weather', weatherRoute)

app.notFound((c) => c.json({ error: 'Not Found' }, 404))
app.onError((err, c) => {
  console.error('[api] unhandled error:', err)
  return c.json({ error: 'Internal Server Error', detail: String(err) }, 500)
})

export default {
  fetch: app.fetch,
  /**
   * Cron Trigger handler. Multiple crons fire by their cron string; we dispatch
   * them all the same way and let each refresher decide whether to skip based
   * on its own cache freshness (cron schedule already gates that).
   */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const tasks: Array<Promise<unknown>> = []
    switch (controller.cron) {
      case '*/5 * * * *':
        tasks.push(refreshQuakeCache(env))
        break
      case '*/15 * * * *':
        tasks.push(refreshHurricaneCache(env))
        break
      case '0 */3 * * *':
        // TLE + NEO ride together to stay within the 3-cron-trigger budget
        // of the Cloudflare Workers free plan (NEO upstream tolerates 3h
        // refresh comfortably — its data covers the next 7 days).
        tasks.push(refreshTleCache(env), refreshNeoCache(env))
        break
      default:
        // Manual /__scheduled invocations and unknown crons refresh everything.
        tasks.push(
          refreshTleCache(env),
          refreshNeoCache(env),
          refreshHurricaneCache(env),
          refreshQuakeCache(env),
        )
    }
    ctx.waitUntil(Promise.allSettled(tasks).then(() => undefined))
  },
}
