import * as THREE from 'three'
import { DEG2RAD, EARTH_RADIUS_KM, KM_TO_SCENE, SCENE_EARTH_RADIUS } from '@universe/shared'

/**
 * Convert geodetic coordinates (lat, lon, altitude in km) to a scene-space
 * vector on or above the Earth sphere.
 *
 * NOTE: scene units use 1 = EARTH_RADIUS_KM. The Earth mesh sits at the origin
 * un-rotated; the scene rotates the Earth around its Y axis to apply Earth
 * sidereal rotation rather than rotating each lat/lon point.
 *
 * The returned vector is in *Earth-fixed* (ECEF-like) coordinates aligned with
 * Earth's rotation axis along +Y. Apply the Earth rotation matrix to obtain
 * the inertial position.
 */
export function geodeticToVec3(
  latDeg: number,
  lonDeg: number,
  altKm = 0,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const lat = latDeg * DEG2RAD
  const lon = lonDeg * DEG2RAD
  const r = SCENE_EARTH_RADIUS + altKm * KM_TO_SCENE
  // Use math: x = r cos(lat) cos(lon), y = r sin(lat), z = -r cos(lat) sin(lon)
  // Sign on z chosen so that lon=0 sits on +X (prime meridian aligned with X).
  const cosLat = Math.cos(lat)
  out.x = r * cosLat * Math.cos(lon)
  out.y = r * Math.sin(lat)
  out.z = -r * cosLat * Math.sin(lon)
  return out
}

/** Scene-space vector to geodetic (approx, spherical Earth). */
export function vec3ToGeodetic(v: THREE.Vector3): { lat: number; lon: number; altKm: number } {
  const r = v.length()
  const lat = Math.asin(v.y / r) / DEG2RAD
  const lon = Math.atan2(-v.z, v.x) / DEG2RAD
  const altKm = (r - SCENE_EARTH_RADIUS) * EARTH_RADIUS_KM
  return { lat, lon, altKm }
}

/**
 * Convert kilometers (any axis) to scene units.
 */
export function kmToScene(km: number): number {
  return km * KM_TO_SCENE
}
