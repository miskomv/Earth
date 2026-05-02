import type { GeoPoint, ISO8601 } from './common.js'

export interface IssState {
  position: GeoPoint
  velocityKmS: number
  visibility: 'daylight' | 'eclipsed'
  footprintKm: number
  solarLat?: number
  solarLon?: number
  units: 'kilometers'
  timestamp: ISO8601
}
