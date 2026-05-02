/**
 * Time utilities for orbital propagation.
 *
 * GMST (Greenwich Mean Sidereal Time) tells us how much Earth has rotated about
 * its axis with respect to the stars. The Three.js Earth mesh is rotated about
 * +Y by this angle so that lat/lon-fixed points stay anchored to ground while
 * Earth turns inside an inertial frame where the Sun and orbits are placed.
 */

const J2000_UNIX_MS = Date.UTC(2000, 0, 1, 12, 0, 0) // 2000-01-01T12:00:00Z

/** Julian Date for a given Date (UTC). */
export function julianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5
}

/** Julian centuries since J2000.0 (TT ~= UTC for this precision). */
export function julianCenturiesSinceJ2000(date: Date): number {
  return (date.getTime() - J2000_UNIX_MS) / (86400000 * 36525)
}

/**
 * Greenwich Mean Sidereal Time in radians for the given UTC date.
 * IAU 1982 / Vallado polynomial in seconds; the per-Julian-century coefficient
 * already encodes ~86636.555 s/day, i.e. one sidereal day plus the diurnal
 * sidereal advance, so we MUST NOT add the within-day UT term separately
 * (a previous version did and was wrong by up to ±180°).
 *
 * Sanity: at J2000.0 (T=0) this returns 67310.548 s = 280.46° — the textbook
 * reference value.
 */
export function gmstRad(date: Date): number {
  const T = julianCenturiesSinceJ2000(date)
  let gmstSec =
    67310.54841 +
    (876600 * 3600 + 8640184.812866) * T +
    0.093104 * T * T -
    6.2e-6 * T * T * T
  gmstSec = ((gmstSec % 86400) + 86400) % 86400
  return (gmstSec / 86400) * Math.PI * 2
}
