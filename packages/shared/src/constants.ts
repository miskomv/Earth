/** Earth equatorial radius in kilometers (WGS-84). */
export const EARTH_RADIUS_KM = 6378.137

/** Astronomical Unit in kilometers. */
export const AU_KM = 149_597_870.7

/** Speed of light in km/s. */
export const C_KM_S = 299_792.458

/** Standard gravitational parameter of the Sun (km^3 / s^2). */
export const SUN_MU = 1.32712440018e11

/** Standard gravitational parameter of Earth (km^3 / s^2). */
export const EARTH_MU = 398_600.4418

/** Conversion factor from degrees to radians. */
export const DEG2RAD = Math.PI / 180

/** Conversion factor from radians to degrees. */
export const RAD2DEG = 180 / Math.PI

/** Scene unit = 1 Earth radius. */
export const SCENE_EARTH_RADIUS = 1

/** Convert km into scene units. */
export const KM_TO_SCENE = 1 / EARTH_RADIUS_KM

/**
 * Visual scale factor for asteroid/satellite size in scene units.
 * Real-scale objects would be invisible from km distances; we exaggerate.
 */
export const VISUAL_SIZE_SCALE = {
  satellite: 0.004,
  iss: 0.012,
  neo: 0.006,
  asteroidLarge: 0.012,
} as const

export type VisualSizeKey = keyof typeof VISUAL_SIZE_SCALE
