import type { ApiEnvelope } from '@universe/shared'

export interface ApiState<T> {
  data: Ref<T | null>
  cachedAt: Ref<string | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  refresh: () => Promise<void>
}

/**
 * Generic fetch composable for API endpoints that return ApiEnvelope.
 * Auto-refreshes on a configurable interval. SSR-safe (skips client-only work).
 */
export function useApiResource<T>(
  path: string,
  options: { intervalMs?: number; immediate?: boolean } = {},
): ApiState<T> {
  const config = useRuntimeConfig()
  const data = ref<T | null>(null) as Ref<T | null>
  const cachedAt = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      const url = `${config.public.apiBase}${path}`
      const env = await $fetch<ApiEnvelope<T> & { error?: string }>(url)
      if ('error' in env && env.error) {
        error.value = env.error
        return
      }
      data.value = env.data
      cachedAt.value = env.cachedAt
    } catch (e) {
      error.value = String(e)
    } finally {
      loading.value = false
    }
  }

  if (import.meta.client) {
    if (options.immediate ?? true) {
      refresh()
    }
    if (options.intervalMs && options.intervalMs > 0) {
      const id = window.setInterval(refresh, options.intervalMs)
      onScopeDispose(() => window.clearInterval(id))
    }
  }

  return { data, cachedAt, loading, error, refresh }
}
