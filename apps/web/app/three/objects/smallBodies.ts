import * as THREE from 'three'
import { Body, HelioVector } from 'astronomy-engine'
import type { SmallBody } from '@universe/shared'
import { AU_KM, VISUAL_SIZE_SCALE } from '@universe/shared'
import {
  keplerPositionEclipticKm,
  eclipticToEquatorialKm,
} from '../math/kepler.js'
import { compressVector } from '../math/distanceCompress.js'

export interface SmallBodiesLayer {
  group: THREE.Group
  setBodies(bodies: SmallBody[]): void
  update(date: Date): void
  setVisible(v: boolean): void
  /** Toggle the per-body Kepler orbit ellipse polylines. */
  setOrbitsVisible(v: boolean): void
  /** Toggle the comet anti-sun tail vectors. */
  setTailsVisible(v: boolean): void
  list(): SmallBody[]
  positionOf(spkid: string): THREE.Vector3 | null
  dispose(): void
}

/**
 * Heliocentric Kepler-propagated bodies, rendered centered on Earth.
 *
 * Frame plumbing:
 *   - Kepler elements yield ecliptic-frame km (per kepler.ts).
 *   - astronomy-engine's HelioVector returns J2000 equatorial-frame AU.
 *   - We rotate the body position from ecliptic → equatorial (obliquity ε),
 *     subtract Earth's equatorial helio position, then map equatorial → scene.
 * Skipping the obliquity rotation tilts asteroid orbits ~23.4° relative to
 * Earth's equator, which is visually wrong by hundreds of millions of km
 * for nearby bodies.
 *
 * Two derived overlays share the same propagation path:
 *   - Orbit lines: sample N points around the body's mean anomaly span and
 *     draw a closed polyline. Earth-relative, recomputed each frame so the
 *     ellipse stays in the right place as Earth moves through its own orbit.
 *   - Comet tails: a thin line segment from the comet's position outward
 *     along the anti-sun direction (radiation pressure proxy).
 */
export function createSmallBodiesLayer(maxCount = 256): SmallBodiesLayer {
  const group = new THREE.Group()
  group.name = 'SmallBodies'

  const sphere = new THREE.SphereGeometry(VISUAL_SIZE_SCALE.asteroidLarge, 8, 8)
  const matAsteroid = new THREE.MeshBasicMaterial({ color: 0xb0a08a })
  const matComet = new THREE.MeshBasicMaterial({ color: 0x9be3ff })
  const matPha = new THREE.MeshBasicMaterial({ color: 0xff6060 })

  const meshAsteroid = new THREE.InstancedMesh(sphere, matAsteroid, maxCount)
  const meshComet = new THREE.InstancedMesh(sphere, matComet, maxCount)
  const meshPha = new THREE.InstancedMesh(sphere, matPha, maxCount)
  for (const m of [meshAsteroid, meshComet, meshPha]) {
    m.frustumCulled = false
    m.count = 0
    group.add(m)
  }

  // Per-body orbit lines. We build one shared geometry buffer with capacity
  // for `maxCount` orbits, each ORBIT_SAMPLES points + 1 to close the loop.
  // Subdivide using a `LineSegments` rather than `Line` so we can express
  // disjoint orbits in one draw call, with degenerate segments separating
  // them.
  const ORBIT_SAMPLES = 96
  const ORBIT_VERTS_PER_BODY = ORBIT_SAMPLES // one Line strip per body, closed via wrap-around
  const orbitsGroup = new THREE.Group()
  orbitsGroup.name = 'SmallBodiesOrbits'
  group.add(orbitsGroup)
  /** One Line per body so we can color them differently. Created lazily in setBodies. */
  const orbitLines = new Map<string, { line: THREE.Line; geom: THREE.BufferGeometry; positions: Float32Array; mat: THREE.LineBasicMaterial }>()

  // Comet tails. Segment per comet, anti-sun direction, capacity = maxCount.
  const tailsGroup = new THREE.Group()
  tailsGroup.name = 'CometTails'
  group.add(tailsGroup)
  const tailLines = new Map<string, { line: THREE.Line; geom: THREE.BufferGeometry; positions: Float32Array; mat: THREE.LineBasicMaterial }>()
  /** Tail length in scene units, fixed for visibility. */
  const TAIL_LENGTH = 4

  let bodies: SmallBody[] = []
  let orbitsEnabled = true
  let tailsEnabled = true
  const positions = new Map<string, THREE.Vector3>()
  const dummy = new THREE.Object3D()
  const scratchHelioEcl = new THREE.Vector3()
  const scratchHelioEq = new THREE.Vector3()
  const scratchScene = new THREE.Vector3()
  const earthHelio = new THREE.Vector3()
  const tailDirEcl = new THREE.Vector3()
  const tailDirEq = new THREE.Vector3()
  const tailDirScene = new THREE.Vector3()
  const _kmIn = { x: 0, y: 0, z: 0 }
  const _sceneOut = { x: 0, y: 0, z: 0 }

  /**
   * Convert geocentric equatorial-km to scene units with log distance
   * compression beyond the Moon, then axis-swap to scene frame. Asteroids
   * and comets at 1-3 AU would otherwise sit 23-70 k scene units away — far
   * outside `controls.maxDistance` — and their orbit ellipses would extend
   * even further. Compression brings them all into a viewable range while
   * preserving relative ordering.
   */
  function eqKmToScene(eqKm: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    _kmIn.x = eqKm.x
    _kmIn.y = eqKm.y
    _kmIn.z = eqKm.z
    compressVector(_kmIn, _sceneOut)
    out.set(_sceneOut.x, _sceneOut.z, -_sceneOut.y)
    return out
  }

  function ensureOrbitLine(b: SmallBody) {
    let entry = orbitLines.get(b.spkid)
    if (entry) return entry
    const positionsArr = new Float32Array(ORBIT_VERTS_PER_BODY * 3)
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3))
    const color = b.kind === 'comet' ? 0x4ed1ff : b.isPha ? 0xff5050 : 0x8a7d6a
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
    const line = new THREE.LineLoop(geom, mat)
    line.frustumCulled = false
    orbitsGroup.add(line)
    entry = { line, geom, positions: positionsArr, mat }
    orbitLines.set(b.spkid, entry)
    return entry
  }

  function ensureTailLine(b: SmallBody) {
    let entry = tailLines.get(b.spkid)
    if (entry) return entry
    const positionsArr = new Float32Array(2 * 3)
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3))
    const mat = new THREE.LineBasicMaterial({
      color: 0x9be3ff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
    const line = new THREE.Line(geom, mat)
    line.frustumCulled = false
    tailsGroup.add(line)
    entry = { line, geom, positions: positionsArr, mat }
    tailLines.set(b.spkid, entry)
    return entry
  }

  function setBodies(list: SmallBody[]) {
    bodies = list.slice(0, maxCount * 3)
    positions.clear()
    // Drop orbit/tail lines for bodies no longer present.
    const presentIds = new Set(list.map((b) => b.spkid))
    for (const [id, entry] of orbitLines) {
      if (!presentIds.has(id)) {
        orbitsGroup.remove(entry.line)
        entry.geom.dispose()
        entry.mat.dispose()
        orbitLines.delete(id)
      }
    }
    for (const [id, entry] of tailLines) {
      if (!presentIds.has(id)) {
        tailsGroup.remove(entry.line)
        entry.geom.dispose()
        entry.mat.dispose()
        tailLines.delete(id)
      }
    }
  }

  function update(date: Date) {
    let aIdx = 0
    let cIdx = 0
    let pIdx = 0
    const earthVec = HelioVector(Body.Earth, date)
    earthHelio.set(
      earthVec.x * AU_KM,
      earthVec.y * AU_KM,
      earthVec.z * AU_KM,
    )

    for (const b of bodies) {
      const helioEcl = keplerPositionEclipticKm(b.elements, date)
      if (!Number.isFinite(helioEcl.x)) continue
      scratchHelioEcl.copy(helioEcl)
      eclipticToEquatorialKm(scratchHelioEcl, scratchHelioEq)
      scratchHelioEq.sub(earthHelio)
      const scenePos = eqKmToScene(scratchHelioEq, scratchScene)
      let cached = positions.get(b.spkid)
      if (!cached) {
        cached = new THREE.Vector3()
        positions.set(b.spkid, cached)
      }
      cached.copy(scenePos)
      dummy.position.copy(scenePos)
      dummy.scale.setScalar(b.kind === 'comet' ? 1.3 : b.isPha ? 1.2 : 1)
      dummy.updateMatrix()
      if (b.kind === 'comet') {
        if (cIdx < maxCount) meshComet.setMatrixAt(cIdx++, dummy.matrix)
      } else if (b.isPha) {
        if (pIdx < maxCount) meshPha.setMatrixAt(pIdx++, dummy.matrix)
      } else {
        if (aIdx < maxCount) meshAsteroid.setMatrixAt(aIdx++, dummy.matrix)
      }

      // ORBIT LINE: sample ORBIT_SAMPLES points around the body's mean anomaly
      // by stepping its mean motion. Each sampled position is computed via
      // the same Kepler→equatorial→subtract Earth→scene chain.
      if (orbitsEnabled) {
        const entry = ensureOrbitLine(b)
        const n = b.elements.n ?? 0.9856076686 / Math.pow(b.elements.a, 1.5)
        const totalDays = 360 / n // one full orbit in days
        const dtPerSample = totalDays / ORBIT_SAMPLES
        for (let k = 0; k < ORBIT_SAMPLES; k++) {
          const sampleDate = new Date(date.getTime() + (k - ORBIT_SAMPLES / 2) * dtPerSample * 86_400_000)
          const sampleHelio = keplerPositionEclipticKm(b.elements, sampleDate)
          if (!Number.isFinite(sampleHelio.x)) continue
          eclipticToEquatorialKm(sampleHelio, scratchHelioEq)
          scratchHelioEq.sub(earthHelio)
          eqKmToScene(scratchHelioEq, scratchScene)
          entry.positions[k * 3] = scratchScene.x
          entry.positions[k * 3 + 1] = scratchScene.y
          entry.positions[k * 3 + 2] = scratchScene.z
        }
        const attr = entry.geom.attributes.position
        if (attr) attr.needsUpdate = true
      }

      // COMET TAIL: anti-sun direction (in heliocentric ecliptic) ≡ helioEcl
      // normalized; rotate the same way as the position to match the scene.
      // Tail goes FROM the comet's scene position OUTWARD along the
      // anti-sun direction by `TAIL_LENGTH` units.
      if (tailsEnabled && b.kind === 'comet') {
        const entry = ensureTailLine(b)
        tailDirEcl.copy(helioEcl).normalize()
        eclipticToEquatorialKm(tailDirEcl, tailDirEq)
        // For a unit vector we don't need to subtract Earth (it's a direction,
        // not a position). Just axis-swap to scene.
        tailDirScene.set(tailDirEq.x, tailDirEq.z, -tailDirEq.y)
        entry.positions[0] = scenePos.x
        entry.positions[1] = scenePos.y
        entry.positions[2] = scenePos.z
        entry.positions[3] = scenePos.x + tailDirScene.x * TAIL_LENGTH
        entry.positions[4] = scenePos.y + tailDirScene.y * TAIL_LENGTH
        entry.positions[5] = scenePos.z + tailDirScene.z * TAIL_LENGTH
        const attr = entry.geom.attributes.position
        if (attr) attr.needsUpdate = true
      }
    }
    meshAsteroid.count = aIdx
    meshComet.count = cIdx
    meshPha.count = pIdx
    meshAsteroid.instanceMatrix.needsUpdate = true
    meshComet.instanceMatrix.needsUpdate = true
    meshPha.instanceMatrix.needsUpdate = true
  }

  function setVisible(v: boolean) {
    group.visible = v
  }

  function setOrbitsVisible(v: boolean) {
    orbitsEnabled = v
    orbitsGroup.visible = v
  }

  function setTailsVisible(v: boolean) {
    tailsEnabled = v
    tailsGroup.visible = v
  }

  function positionOf(spkid: string): THREE.Vector3 | null {
    return positions.get(spkid) ?? null
  }

  function dispose() {
    sphere.dispose()
    matAsteroid.dispose()
    matComet.dispose()
    matPha.dispose()
    for (const e of orbitLines.values()) {
      e.geom.dispose()
      e.mat.dispose()
    }
    orbitLines.clear()
    for (const e of tailLines.values()) {
      e.geom.dispose()
      e.mat.dispose()
    }
    tailLines.clear()
  }

  return {
    group,
    setBodies,
    update,
    setVisible,
    setOrbitsVisible,
    setTailsVisible,
    list: () => bodies,
    positionOf,
    dispose,
  }
}
