import { ref, onScopeDispose } from 'vue'

export interface GeoLocation {
  lat: number
  lon: number
  accuracyMeters: number
  timestamp: number
}

/**
 * Browser geolocation wrapper. Returns reactive refs and an explicit
 * `request()` function: we never silently prompt the user for permission;
 * the prompt fires only when the UI calls `request()`.
 */
export function useGeolocation() {
  const location = ref<GeoLocation | null>(null)
  const error = ref<string | null>(null)
  const isSupported = typeof navigator !== 'undefined' && !!navigator.geolocation
  let watchId: number | null = null

  function request() {
    if (!isSupported) {
      error.value = 'Geolocation API not available in this browser'
      return
    }
    error.value = null
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        location.value = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }
        // Watch for updates so the marker tracks if the user moves.
        if (watchId === null) {
          watchId = navigator.geolocation.watchPosition(
            (p) => {
              location.value = {
                lat: p.coords.latitude,
                lon: p.coords.longitude,
                accuracyMeters: p.coords.accuracy,
                timestamp: p.timestamp,
              }
            },
            (e) => { error.value = e.message },
            { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
          )
        }
      },
      (e) => { error.value = e.message },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    )
  }

  function clear() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    location.value = null
    error.value = null
  }

  onScopeDispose(() => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  })

  return { location, error, isSupported, request, clear }
}
