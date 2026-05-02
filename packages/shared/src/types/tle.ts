/** A two-line element set entry, parsed minimally on the server. */
export interface TleEntry {
  /** Catalog name (e.g., "ISS (ZARYA)"). */
  name: string
  /** First line of TLE. */
  line1: string
  /** Second line of TLE. */
  line2: string
  /** NORAD catalog number, parsed from line1 cols 3-7. */
  noradId: number
  /** Group classification (e.g., "stations", "active", "starlink"). */
  group: string
}

/** Predefined CelesTrak groups we expose. */
export type TleGroup =
  | 'stations'
  | 'active'
  | 'starlink'
  | 'gps-ops'
  | 'galileo'
  | 'weather'
  | 'science'
  | 'geo'
  | 'visual'
