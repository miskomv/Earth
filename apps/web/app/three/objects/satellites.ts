import * as THREE from 'three'
import * as satellite from 'satellite.js'
import type { TleEntry } from '@universe/shared'
import { KM_TO_SCENE, VISUAL_SIZE_SCALE } from '@universe/shared'

export interface SatelliteRecord {
  entry: TleEntry
  /** Last computed altitude (km above mean Earth radius). */
  altKm: number
  /** Last computed speed in km/s. */
  velocityKmS: number
  /** Last computed sub-satellite point. */
  position: { lat: number; lon: number }
}

export interface SatellitesLayer {
  group: THREE.Group
  /** Underlying mesh — exposed so the scene's raycaster can intersect it. */
  mesh: THREE.InstancedMesh
  setEntries(entries: TleEntry[]): void
  update(date: Date): void
  setVisible(v: boolean): void
  /** Total parsed satellite records (parsable TLEs after twoline2satrec). */
  count(): number
  /** Records currently rendering (i.e. whose last propagate() succeeded). */
  liveCount(): number
  /** Resolve a picked instance ID to the satellite record at that slot. */
  recordAt(index: number): SatelliteRecord | null
  dispose(): void
}

interface SatRecord {
  entry: TleEntry
  satrec: satellite.SatRec
  /** Cache of last computed derived values, used by `recordAt` for InfoPanel. */
  derived: SatelliteRecord
}

/**
 * Renders many satellites with a single InstancedMesh; SGP4 propagation runs
 * client-side per frame. We compute ECI position (km) and convert to scene
 * coords using the same axis convention as the Sun/Earth helpers — note that
 * SGP4 returns ECI positions in km in the equatorial frame already; the +Z
 * axis is the Earth rotation axis. We map (x, z, -y) -> scene (X, Y, Z).
 */
export function createSatellitesLayer(maxCount = 12_000): SatellitesLayer {
  const group = new THREE.Group()
  group.name = 'Satellites'

  const geom = new THREE.SphereGeometry(VISUAL_SIZE_SCALE.satellite, 6, 6)
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd87a, transparent: true, opacity: 0.9 })
  const mesh = new THREE.InstancedMesh(geom, mat, maxCount)
  mesh.frustumCulled = false
  mesh.count = 0
  group.add(mesh)

  const dummy = new THREE.Object3D()
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
  let records: SatRecord[] = []

  function setEntries(entries: TleEntry[]) {
    records = []
    for (const entry of entries) {
      try {
        const satrec = satellite.twoline2satrec(entry.line1, entry.line2)
        if (satrec.error) continue
        records.push({
          entry,
          satrec,
          derived: { entry, altKm: 0, velocityKmS: 0, position: { lat: 0, lon: 0 } },
        })
        if (records.length >= maxCount) break
      } catch {
        // skip bad TLE
      }
    }
    mesh.count = records.length
    // Initialize all instances to hidden until first update populates positions.
    for (let i = 0; i < records.length; i++) mesh.setMatrixAt(i, hidden)
    mesh.instanceMatrix.needsUpdate = true
  }

  /**
   * Propagate every record. Failed propagations get a zero-scale matrix at
   * their slot (still part of the draw range) so the index of every other
   * record stays stable; we keep `mesh.count = records.length` to render
   * every slot, with bad ones invisible.
   *
   * Note: SGP4 returns ECI (TEME-of-date) positions in km. ECI axes:
   *   +X = vernal equinox, +Y = 90° east on equator, +Z = north pole.
   * Scene axes: +X = vernal equinox, +Y = north pole, +Z = -ECI Y.
   * No GMST rotation needed — both frames are inertial.
   */
  let liveCount = 0

  function update(date: Date) {
    const gmst = satellite.gstime(date)
    let live = 0
    for (let i = 0; i < records.length; i++) {
      const rec = records[i]!
      const pv = satellite.propagate(rec.satrec, date)
      const pos = pv.position
      const vel = pv.velocity
      if (!pos || typeof pos === 'boolean') {
        mesh.setMatrixAt(i, hidden)
        continue
      }
      dummy.position.set(pos.x * KM_TO_SCENE, pos.z * KM_TO_SCENE, -pos.y * KM_TO_SCENE)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      // Update cached derived values so click → InfoPanel can read them.
      const altKm = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z) - 6378.137
      const speedKmS = vel && typeof vel !== 'boolean'
        ? Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z)
        : 0
      const geo = satellite.eciToGeodetic(pos, gmst)
      rec.derived.altKm = altKm
      rec.derived.velocityKmS = speedKmS
      rec.derived.position.lat = (geo.latitude * 180) / Math.PI
      rec.derived.position.lon = (geo.longitude * 180) / Math.PI
      live++
    }
    liveCount = live
    mesh.count = records.length
    mesh.instanceMatrix.needsUpdate = true
  }

  function setVisible(v: boolean) {
    group.visible = v
  }

  function dispose() {
    geom.dispose()
    mat.dispose()
  }

  return {
    group,
    mesh,
    setEntries,
    update,
    setVisible,
    count: () => records.length,
    liveCount: () => liveCount,
    recordAt: (index: number) => records[index]?.derived ?? null,
    dispose,
  }
}
