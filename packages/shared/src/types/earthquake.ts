import type { ISO8601, GeoPoint } from './common.js'

export interface Earthquake {
  id: string
  magnitude: number
  place: string
  time: ISO8601
  epochUnixMs: number
  position: GeoPoint
  depthKm: number
  url: string
  felt?: number
  tsunami: boolean
  type: string
  alert?: 'green' | 'yellow' | 'orange' | 'red' | null
}
