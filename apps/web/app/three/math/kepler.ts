import * as THREE from 'three'
import { AU_KM, DEG2RAD, KM_TO_SCENE } from '@universe/shared'
import type { KeplerElements } from '@universe/shared'
import { julianDate } from './time.js'

/**
 * Solve Kepler's equation E - e sin E = M for the eccentric anomaly E.
 * Newton-Raphson, valid for elliptic orbits (e < 1). For e >= 1 the equation
 * itself is wrong (parabolic / hyperbolic anomaly require different forms),
 * so we throw rather than silently produce NaN — keeps callers honest.
 */
export function solveKepler(M: number, e: number, tol = 1e-9, maxIter = 30): number {
  if (!(e >= 0) || e >= 1) {
    // We don't render parabolic/hyperbolic bodies; signal NaN so the caller
    // skips them rather than crashing the whole render loop.
    return NaN
  }
  let E = e < 0.8 ? M : Math.PI
  for (let k = 0; k < maxIter; k++) {
    const f = E - e * Math.sin(E) - M
    const fp = 1 - e * Math.cos(E)
    // Bail out if Newton's denominator collapses; defensive — for e<1 we have
    // |fp| >= 1 - e > 0 so this only fires on bad inputs.
    if (Math.abs(fp) < 1e-12) break
    const dE = f / fp
    E -= dE
    if (Math.abs(dE) < tol) break
  }
  return E
}

/**
 * Return heliocentric ecliptic Cartesian position (km) at a given Date.
 * Includes the rotation from perifocal to ecliptic frame using i, Ω, ω.
 *
 * Inputs:
 *   - elements with `epoch` as Julian Date.
 *   - n (mean motion deg/day) — if absent we derive from a (AU) using
 *     n = sqrt(GM_sun / a^3) but in deg/day: 0.9856076686 / a^1.5.
 */
export function keplerPositionEclipticKm(elements: KeplerElements, date: Date): THREE.Vector3 {
  const jd = julianDate(date)
  const dt = jd - elements.epoch
  const n = elements.n ?? 0.9856076686 / Math.pow(elements.a, 1.5) // deg/day
  const M = (elements.ma + n * dt) * DEG2RAD
  const e = elements.e
  const E = solveKepler(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), e)
  const cosE = Math.cos(E)
  const sinE = Math.sin(E)
  const aKm = elements.a * AU_KM
  // Position in perifocal frame.
  const xP = aKm * (cosE - e)
  const yP = aKm * Math.sqrt(1 - e * e) * sinE
  // Rotate by argument of periapsis ω, then by inclination i, then by Ω.
  const w = elements.w * DEG2RAD
  const i = elements.i * DEG2RAD
  const om = elements.om * DEG2RAD
  const cosw = Math.cos(w)
  const sinw = Math.sin(w)
  const cosi = Math.cos(i)
  const sini = Math.sin(i)
  const coso = Math.cos(om)
  const sino = Math.sin(om)
  const x =
    (coso * cosw - sino * sinw * cosi) * xP +
    (-coso * sinw - sino * cosw * cosi) * yP
  const y =
    (sino * cosw + coso * sinw * cosi) * xP +
    (-sino * sinw + coso * cosw * cosi) * yP
  const z = sinw * sini * xP + cosw * sini * yP
  return new THREE.Vector3(x, y, z)
}

/**
 * J2000 mean obliquity of the ecliptic — the tilt between Earth's equatorial
 * plane and the ecliptic. Used to rotate ecliptic-frame Kepler outputs into
 * the equatorial frame the rest of the scene uses (Earth's rotation axis is
 * scene +Y, which is the equatorial pole).
 *
 * NOTE: this is fixed at the J2000 mean value because all Kepler elements we
 * consume from JPL SBDB are referenced to J2000 mean ecliptic. If we ever
 * switch to mean-of-date elements, this constant must be replaced with a
 * date-dependent obliquity formula.
 */
const OBLIQUITY_RAD = 23.4392911 * DEG2RAD
const COS_OBLIQUITY = Math.cos(OBLIQUITY_RAD)
const SIN_OBLIQUITY = Math.sin(OBLIQUITY_RAD)

/**
 * Rotate a heliocentric ecliptic-frame vector (km) into the J2000 equatorial
 * frame (km). Rotation about +X by +ε.
 */
export function eclipticToEquatorialKm(
  v: THREE.Vector3,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const x = v.x
  const y = COS_OBLIQUITY * v.y - SIN_OBLIQUITY * v.z
  const z = SIN_OBLIQUITY * v.y + COS_OBLIQUITY * v.z
  out.set(x, y, z)
  return out
}

/**
 * Convert J2000 equatorial-frame km to scene units. Same axis convention as
 * `sunPositionScene`: scene.X = equatorial.X, scene.Y = equatorial.Z (pole),
 * scene.Z = -equatorial.Y.
 */
export function equatorialKmToScene(
  v: THREE.Vector3,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  out.x = v.x * KM_TO_SCENE
  out.y = v.z * KM_TO_SCENE
  out.z = -v.y * KM_TO_SCENE
  return out
}
