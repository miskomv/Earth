# Earth

Real-time 3D Earth visualization rendered in the browser with WebGL: surrounding asteroids, comets, satellites, the ISS, plus active hurricanes and earthquakes, the Sun, the Moon and the inner planets — all positioned from real orbital mechanics.

![Universe preview](https://wsrv.nl/?n=-1&output=webp&url=https%3A%2F%2Fiili.io%2FBLn8s9e.png)

## Stack

- **API** (`apps/api/`) — [Hono](https://hono.dev) on Cloudflare Workers, KV cache with stale-while-revalidate, scheduled refresh via Cron Triggers.
- **Web** (`apps/web/`) — [Nuxt 4](https://nuxt.com) + [Three.js](https://threejs.org) with custom shaders (atmosphere, day/night terminator, cloud projection). [satellite.js](https://github.com/shashwatak/satellite-js) for SGP4 propagation, [astronomy-engine](https://github.com/cosinekitty/astronomy) for Sun / Moon / planet ephemerides.
- **Shared** (`packages/shared/`) — TypeScript types and orbital constants used by both sides.

```
universe/
├── apps/
│   ├── api/    Cloudflare Worker (Hono)
│   └── web/    Nuxt 4 site
└── packages/
    └── shared/ Types & constants
```

## Data sources

| Layer                  | Source                                                  | Refresh   |
|------------------------|---------------------------------------------------------|-----------|
| Earth / Moon textures  | [jsDelivr](https://cdn.jsdelivr.net/) static assets     | Static    |
| Near-Earth asteroids   | [NASA NeoWs](https://api.nasa.gov/) (DEMO_KEY)          | 3 h       |
| Asteroid orbits        | [JPL Small-Body Database](https://ssd-api.jpl.nasa.gov) | 24 h      |
| Satellites & ISS       | [CelesTrak](https://celestrak.org) GP API (TLEs)        | 3 h       |
| Active hurricanes      | [NOAA NHC](https://www.nhc.noaa.gov) current storms     | 15 min    |
| Earthquakes            | [USGS GeoJSON](https://earthquake.usgs.gov) (M2.5+, 24h)| 5 min     |
| Sun / Moon / planets   | Computed locally via `astronomy-engine`                 | Per frame |

## Quick start

```bash
pnpm install
pnpm dev            # API on :8787 (wrangler) + web on :3000 (nuxt) in parallel
```

Open http://localhost:3000.

The web defaults to `http://localhost:8787` for the API base. To point it at a deployed Worker, create `apps/web/.env`:

```
NUXT_PUBLIC_API_BASE=https://your-worker.example.workers.dev
```

### Optional environment variables

The API works with no secrets out of the box. Two optional values, both with templates in `apps/api/.dev.vars.example`:

- `OPENWEATHER_API_KEY` — only required if you want the live cloud-tile proxy at `/api/weather/clouds/...`. Get one at [openweathermap.org/api](https://openweathermap.org/api). The front-end does not consume this proxy by default.
- `ALLOWED_ORIGINS` — comma-separated list of allowed CORS hostnames (each matches the exact host plus any subdomain). Defaults to `*`.

For local dev copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and fill what you need. `.dev.vars` is git-ignored.

NASA NeoWs uses the public `DEMO_KEY` baked into `apps/api/src/routes/neo.ts`. If you hit the anonymous rate limit, request your own key at [api.nasa.gov](https://api.nasa.gov) and substitute it there.

## Deploying

### API — Cloudflare Workers

1. Create a KV namespace once:
   ```bash
   cd apps/api
   npx wrangler kv namespace create CACHE
   ```
   Copy the printed id into `apps/api/wrangler.toml` (replace `REPLACE_WITH_KV_NAMESPACE_ID` in both `id` and `preview_id`).

2. (Optional) Tighten CORS by editing `ALLOWED_ORIGINS` in `wrangler.toml`, e.g. `"your-site.pages.dev"`.

3. Deploy:
   ```bash
   pnpm --filter @universe/api deploy
   ```

The Worker registers three Cron Triggers (5 min / 15 min / 3 h) to keep the KV cache warm — within the Free plan limit of three cron triggers per Worker.

### Web — any static host

```bash
pnpm --filter @universe/web generate
```

Output is in `apps/web/.output/public`. Deploy that directory to Cloudflare Pages, Netlify, Vercel, GitHub Pages, etc. Set `NUXT_PUBLIC_API_BASE` at build time to point at your deployed Worker.

For Cloudflare Pages:

```bash
cd apps/web
NUXT_PUBLIC_API_BASE=https://your-worker.example.workers.dev pnpm generate
npx wrangler pages deploy .output/public --project-name=your-project
```

## Controls

- **Drag** — orbit camera around Earth
- **Scroll** — zoom
- **Right-click drag** — pan
- **Click object** — focus + info panel
- **Pause / Play** (bottom bar) — freezes the scene at the current real-time instant; resuming snaps back to live (no simulated future scrubbing)
- **Layer toggles** (top-right) — clouds, atmosphere, stars, satellites, ISS, asteroids, NEO approaches, hurricanes, earthquakes

## Notes

- The default satellite group is `visual` (~150 naked-eye satellites) for performance. Switch the call in `apps/web/app/composables/useUniverseData.ts` to `active` for the full ~10k fleet.
- Asteroid sizes are exaggerated by `VISUAL_SIZE_SCALE` (`packages/shared/src/constants.ts`); at true scale they would be sub-pixel.
- Distances beyond the Moon are log-compressed so the inner planets and Sun are reachable inside the camera frustum without making Earth a single pixel.
- Coordinates use a J2000 inertial frame (scene-X = vernal equinox, scene-Y = polar axis); the Earth mesh rotates by GMST each frame.
- Earth-fixed markers (ISS, hurricanes, earthquakes) use a spherical Earth — sub-km accuracy is not the goal.

## License

MIT — see `LICENSE` if present, otherwise feel free to copy.
