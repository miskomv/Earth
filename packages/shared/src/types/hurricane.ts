import type { ISO8601, GeoPoint } from './common.js'

export type StormCategory =
  | 'TD' // tropical depression
  | 'TS' // tropical storm
  | 'HU1'
  | 'HU2'
  | 'HU3'
  | 'HU4'
  | 'HU5'
  | 'EX' // extratropical
  | 'SS' // subtropical storm
  | 'SD' // subtropical depression
  | 'PT' // post-tropical

export interface HurricaneForecastPoint extends GeoPoint {
  validAt: ISO8601
  windKt?: number
  pressureMb?: number
  category?: StormCategory
}

export interface ActiveHurricane {
  id: string
  name: string
  basin: 'AL' | 'EP' | 'CP' | 'WP' | 'IO' | 'SH'
  position: GeoPoint
  movementDeg?: number
  movementKt?: number
  windKt: number
  gustKt?: number
  pressureMb?: number
  category: StormCategory
  /** Forecast track points; absent when the upstream KMZ ingestion is not wired. */
  forecastTrack?: HurricaneForecastPoint[]
  /** Past observed track points; absent when the upstream KMZ ingestion is not wired. */
  pastTrack?: HurricaneForecastPoint[]
  advisoryAt: ISO8601
  source: 'NHC' | 'JTWC' | 'CPHC'
}
