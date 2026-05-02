import * as THREE from 'three'
import { geodeticToVec3 } from '../math/coords.js'
import { gmstRad } from '../math/time.js'

export interface UserMarkerLayer {
  group: THREE.Group
  setLocation(lat: number, lon: number): void
  clearLocation(): void
  update(date: Date): void
  setVisible(v: boolean): void
  position: THREE.Vector3
  hasLocation(): boolean
  getLatLon(): { lat: number; lon: number } | null
  dispose(): void
}

/**
 * Marker showing the user's geolocation on Earth's surface. Toggleable like
 * any other layer; hidden until the browser actually grants permission and
 * a fix lands. The marker is a small bright dot with a vertical column rising
 * a few hundred km into the sky so it's visible from any orbital camera angle
 * (a flush-on-surface dot would disappear behind the limb on rotation).
 */
export function createUserMarkerLayer(): UserMarkerLayer {
  const group = new THREE.Group()
  group.name = 'UserMarker'
  group.visible = false

  // Bright pin head.
  const pinGeom = new THREE.SphereGeometry(0.012, 12, 12)
  const pinMat = new THREE.MeshBasicMaterial({ color: 0x4dffae })
  const pin = new THREE.Mesh(pinGeom, pinMat)
  group.add(pin)

  // Vertical beam: thin cylinder from surface up ~200 km, semitransparent.
  const beamHeight = 0.04
  const beamGeom = new THREE.CylinderGeometry(0.002, 0.002, beamHeight, 8)
  beamGeom.translate(0, beamHeight / 2, 0)
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x4dffae,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  })
  const beam = new THREE.Mesh(beamGeom, beamMat)
  group.add(beam)

  let lat: number | null = null
  let lon: number | null = null
  const position = new THREE.Vector3()
  const _surface = new THREE.Vector3()
  const _outward = new THREE.Vector3()

  function setLocation(latDeg: number, lonDeg: number) {
    lat = latDeg
    lon = lonDeg
    group.visible = true
  }

  function clearLocation() {
    lat = null
    lon = null
    group.visible = false
  }

  function update(date: Date) {
    if (lat === null || lon === null) return
    geodeticToVec3(lat, lon, 0, _surface)
    const gmst = gmstRad(date)
    const cos = Math.cos(gmst)
    const sin = Math.sin(gmst)
    const x = _surface.x * cos + _surface.z * sin
    const z = -_surface.x * sin + _surface.z * cos
    _surface.set(x, _surface.y, z)
    position.copy(_surface)
    pin.position.copy(_surface)
    // Orient the beam so it points radially outward.
    _outward.copy(_surface).normalize()
    beam.position.copy(_surface)
    // Aim local +Y toward _outward.
    beam.up.copy(_outward)
    beam.lookAt(_surface.x + _outward.x, _surface.y + _outward.y, _surface.z + _outward.z)
    // lookAt orients local -Z toward target; we want local +Y toward outward.
    // Adjust by rotating 90° around local X.
    beam.rotateX(Math.PI / 2)
  }

  function setVisible(v: boolean) {
    group.visible = v && lat !== null
  }

  function dispose() {
    pinGeom.dispose()
    pinMat.dispose()
    beamGeom.dispose()
    beamMat.dispose()
  }

  return {
    group,
    setLocation,
    clearLocation,
    update,
    setVisible,
    position,
    hasLocation: () => lat !== null,
    getLatLon: () => (lat !== null && lon !== null ? { lat, lon } : null),
    dispose,
  }
}
