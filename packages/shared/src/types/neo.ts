import type { ISO8601 } from './common.js'

/** A single Near-Earth Object as returned by NASA NeoWs feed. */
export interface NearEarthObject {
  id: string
  neoReferenceId: string
  name: string
  nasaJplUrl: string
  absoluteMagnitudeH: number
  estimatedDiameterMetersMin: number
  estimatedDiameterMetersMax: number
  isPotentiallyHazardous: boolean
  isSentryObject: boolean
  closeApproach: NeoCloseApproach
}

export interface NeoCloseApproach {
  date: ISO8601
  epochUnixMs: number
  relativeVelocityKmS: number
  missDistanceKm: number
  missDistanceLunar: number
  orbitingBody: string
}

export interface NeoFeedResponse {
  startDate: string
  endDate: string
  count: number
  objects: NearEarthObject[]
}
