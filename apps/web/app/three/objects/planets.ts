import * as THREE from 'three'
import { Body, GeoVector } from 'astronomy-engine'
import { AU_KM } from '@universe/shared'
import { compressVector } from '../math/distanceCompress.js'

export interface PlanetInfo {
  name: string
  body:
    | typeof Body.Mercury
    | typeof Body.Venus
    | typeof Body.Mars
    | typeof Body.Jupiter
    | typeof Body.Saturn
  /** Visual sphere radius in scene units. Inflated relative to true scale so the planet reads against the starfield. */
  visualRadius: number
  /** Tinted base color (used directly as MeshBasicMaterial color since we don't carry textures for planets). */
  color: number
  /** True equatorial radius (km), informational. */
  radiusKm: number
}

const PLANETS: PlanetInfo[] = [
  { name: 'Mercury', body: Body.Mercury, visualRadius: 1.3, color: 0x8a7a6a, radiusKm: 2439.7 },
  { name: 'Venus',   body: Body.Venus,   visualRadius: 1.9, color: 0xe7c98a, radiusKm: 6051.8 },
  { name: 'Mars',    body: Body.Mars,    visualRadius: 1.7, color: 0xc1502e, radiusKm: 3389.5 },
  { name: 'Jupiter', body: Body.Jupiter, visualRadius: 5.0, color: 0xc7a17a, radiusKm: 69911 },
  { name: 'Saturn',  body: Body.Saturn,  visualRadius: 4.4, color: 0xd9b87b, radiusKm: 58232 },
]

export interface PlanetsLayer {
  group: THREE.Group
  update(date: Date): void
  setVisible(v: boolean): void
  list(): PlanetInfo[]
  positionOf(name: string): THREE.Vector3 | null
  dispose(): void
}

interface PlanetEntry {
  info: PlanetInfo
  mesh: THREE.Mesh
  position: THREE.Vector3
  geom: THREE.SphereGeometry
  mat: THREE.MeshBasicMaterial
  ring?: { mesh: THREE.Mesh; geom: THREE.RingGeometry; mat: THREE.MeshBasicMaterial }
}

/**
 * Mercury through Saturn. Each planet's geocentric position comes from
 * `astronomy-engine.GeoVector(Body.X, date)` in equatorial AU; we convert to
 * km, run the distance compression so distant bodies sit within
 * `controls.maxDistance`, and apply the same axis swap as Sun and Moon to
 * map into scene coords. Sizes are inflated for visibility (real-scale would
 * leave even Jupiter sub-pixel at our compressed distances).
 *
 * Saturn gets a thin alpha-mapped ring disc.
 */
export function createPlanetsLayer(): PlanetsLayer {
  const group = new THREE.Group()
  group.name = 'Planets'

  const entries: PlanetEntry[] = PLANETS.map((info) => {
    const geom = new THREE.SphereGeometry(info.visualRadius, 32, 32)
    const mat = new THREE.MeshBasicMaterial({ color: info.color, toneMapped: false })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.name = info.name
    group.add(mesh)
    const entry: PlanetEntry = { info, mesh, geom, mat, position: new THREE.Vector3() }
    if (info.name === 'Saturn') {
      const inner = info.visualRadius * 1.3
      const outer = info.visualRadius * 2.4
      const ringGeom = new THREE.RingGeometry(inner, outer, 96)
      // Tilt the ring toward the planet's axial inclination (~26.7°). We do
      // it as a static rotation around the planet's local X for a recognizable
      // silhouette regardless of viewing angle.
      ringGeom.rotateX(Math.PI / 2)
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xc7a878,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        toneMapped: false,
      })
      const ringMesh = new THREE.Mesh(ringGeom, ringMat)
      ringMesh.rotation.z = (26.7 * Math.PI) / 180
      mesh.add(ringMesh)
      entry.ring = { mesh: ringMesh, geom: ringGeom, mat: ringMat }
    }
    return entry
  })

  const _kmIn = { x: 0, y: 0, z: 0 }
  const _sceneOut = { x: 0, y: 0, z: 0 }

  function update(date: Date) {
    for (const entry of entries) {
      const v = GeoVector(entry.info.body, date, false)
      _kmIn.x = v.x * AU_KM
      _kmIn.y = v.y * AU_KM
      _kmIn.z = v.z * AU_KM
      compressVector(_kmIn, _sceneOut)
      entry.position.set(_sceneOut.x, _sceneOut.z, -_sceneOut.y)
      entry.mesh.position.copy(entry.position)
    }
  }

  function setVisible(v: boolean) {
    group.visible = v
  }

  function positionOf(name: string): THREE.Vector3 | null {
    return entries.find((e) => e.info.name === name)?.position ?? null
  }

  function dispose() {
    for (const e of entries) {
      e.geom.dispose()
      e.mat.dispose()
      if (e.ring) {
        e.ring.geom.dispose()
        e.ring.mat.dispose()
      }
    }
  }

  return { group, update, setVisible, list: () => entries.map((e) => e.info), positionOf, dispose }
}
