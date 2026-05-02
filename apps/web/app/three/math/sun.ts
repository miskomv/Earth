import * as THREE from 'three'
import { Body, GeoVector } from 'astronomy-engine'
import { AU_KM, KM_TO_SCENE } from '@universe/shared'

/**
 * Compute the Sun's position in the same inertial frame the scene uses.
 *
 * astronomy-engine returns equatorial (mean-of-date) Cartesian coordinates in
 * AU. In scene coords we use +Y as Earth's rotation axis, +X as the direction
 * of the vernal equinox at J2000 (matches our gmst-rotated Earth mesh).
 *
 * astronomy-engine convention: x → vernal equinox, y → 90° east on equator,
 * z → north pole. We map (x, z, -y) → scene (X, Y, Z).
 */
export function sunPositionScene(date: Date, out = new THREE.Vector3()): THREE.Vector3 {
  const v = GeoVector(Body.Sun, date, false)
  // Convert AU → km → scene.
  const sx = v.x * AU_KM * KM_TO_SCENE
  const sy = v.y * AU_KM * KM_TO_SCENE
  const sz = v.z * AU_KM * KM_TO_SCENE
  out.x = sx
  out.y = sz
  out.z = -sy
  return out
}

/** Unit vector toward the Sun. */
export function sunDirectionScene(date: Date, out = new THREE.Vector3()): THREE.Vector3 {
  return sunPositionScene(date, out).normalize()
}
