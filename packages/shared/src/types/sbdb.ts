import type { ISO8601 } from './common.js'

/** Keplerian orbital elements for heliocentric propagation. */
export interface KeplerElements {
  /** Semi-major axis (AU). */
  a: number
  /** Eccentricity (dimensionless). */
  e: number
  /** Inclination (deg). */
  i: number
  /** Longitude of ascending node (deg). */
  om: number
  /** Argument of perihelion (deg). */
  w: number
  /** Mean anomaly at epoch (deg). */
  ma: number
  /** Epoch as Julian Date. */
  epoch: number
  /** Mean motion (deg/day). */
  n?: number
}

export interface SmallBody {
  spkid: string
  fullname: string
  shortname?: string
  kind: 'asteroid' | 'comet'
  isPha: boolean
  isNeo: boolean
  diameterKm?: number
  albedo?: number
  elements: KeplerElements
  /** Last orbit determination date. */
  orbitClass?: string
  fetchedAt: ISO8601
}
