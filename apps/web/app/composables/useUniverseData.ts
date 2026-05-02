import type {
  ActiveHurricane,
  Earthquake,
  NeoFeedResponse,
  SmallBody,
  TleEntry,
} from '@universe/shared'
import { useApiResource } from './useApi.js'

/**
 * Group of all live data feeds we depend on.
 *
 * Note: ISS is intentionally NOT a separate feed. Its position is propagated
 * client-side from the same TLE list (`/api/tle/visual`) using SGP4 — the
 * same algorithm wheretheiss.at runs internally — so we get sub-meter
 * accuracy without hitting any HTTP endpoint per second.
 */
export function useUniverseData() {
  // Quakes: every 5 min refresh client-side too.
  const quakes = useApiResource<Earthquake[]>('/api/quakes', { intervalMs: 5 * 60_000 })
  // Hurricanes: every 15 min.
  const hurricanes = useApiResource<ActiveHurricane[]>('/api/hurricanes', { intervalMs: 15 * 60_000 })
  // NEO feed: every 3 h, matching the server's cron-refresh cadence so client
  // and server stay in lockstep (server cron at `0 */3 * * *` now refreshes
  // both TLE and NEO together).
  const neos = useApiResource<NeoFeedResponse>('/api/neo/feed', { intervalMs: 3 * 60 * 60_000 })
  // TLEs: "visual" group covers naked-eye visible satellites (~150) — good
  // density without melting the GPU. Switch to 'active' (~10k) for the full
  // active fleet once perf is profiled.
  const tle = useApiResource<TleEntry[]>('/api/tle/visual', { intervalMs: 3 * 60 * 60_000 })
  // Curated asteroids/comets: every 24 h.
  const sbdb = useApiResource<SmallBody[]>('/api/sbdb', { intervalMs: 24 * 60 * 60_000 })

  return { quakes, hurricanes, neos, tle, sbdb }
}
