/** ISO-8601 timestamp string. */
export type ISO8601 = string

/** Geographic point on Earth. */
export interface GeoPoint {
  lat: number
  lon: number
  altKm?: number
}

/** Wrapper used by all API responses, carries cache metadata. */
export interface ApiEnvelope<T> {
  data: T
  cachedAt: ISO8601
  ttlSeconds: number
  source: string
}

/** Standardized API error. */
export interface ApiError {
  error: string
  status: number
  detail?: string
}
