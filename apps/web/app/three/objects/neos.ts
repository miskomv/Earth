import * as THREE from 'three'
import type { NearEarthObject } from '@universe/shared'
import { VISUAL_SIZE_SCALE } from '@universe/shared'
import { compressKmToScene } from '../math/distanceCompress.js'

export interface NeosLayer {
  group: THREE.Group
  setNeos(list: NearEarthObject[]): void
  update(date: Date): void
  setVisible(v: boolean): void
  list(): NearEarthObject[]
  pickById(id: string): NearEarthObject | null
  positionOf(id: string): THREE.Vector3 | null
  dispose(): void
}

/**
 * NEO close-approach visualization. We don't have full orbital elements from
 * the NeoWs feed, but we do have closest-approach distance and time. We draw
 * each NEO traveling on a straight line through Earth (offset randomly in the
 * normal plane) so its closest point is at `missDistanceKm` at the close
 * approach time. This gives a sense of "stuff zooming past".
 */
export function createNeosLayer(): NeosLayer {
  const group = new THREE.Group()
  group.name = 'NEOs'

  const sphereGeom = new THREE.SphereGeometry(VISUAL_SIZE_SCALE.neo, 8, 8)
  const matNormal = new THREE.MeshBasicMaterial({ color: 0xb0c8ff, transparent: true, opacity: 0.95 })
  const matHazard = new THREE.MeshBasicMaterial({ color: 0xff8a4d, transparent: true, opacity: 0.95 })

  const MAX = 1024
  const meshNormal = new THREE.InstancedMesh(sphereGeom, matNormal, MAX)
  const meshHazard = new THREE.InstancedMesh(sphereGeom, matHazard, MAX)
  meshNormal.frustumCulled = false
  meshHazard.frustumCulled = false
  meshNormal.count = 0
  meshHazard.count = 0
  group.add(meshNormal)
  group.add(meshHazard)

  interface Track {
    neo: NearEarthObject
    /** Closest-approach point in scene (offset perp to Earth-Sun line). */
    closestPoint: THREE.Vector3
    /** Velocity vector (scene units / sec). */
    velocity: THREE.Vector3
    /** Approach epoch ms. */
    epochMs: number
  }

  const tracks: Track[] = []
  const positions = new Map<string, THREE.Vector3>()
  const dummy = new THREE.Object3D()

  function setNeos(list: NearEarthObject[]) {
    tracks.length = 0
    positions.clear()
    let i = 0
    for (const neo of list) {
      // Pick a stable pseudo-random plane offset based on the NEO id.
      const seed = hashStr(neo.id)
      const az = (seed % 360) * (Math.PI / 180)
      const inc = (((seed * 31) % 180) - 90) * (Math.PI / 180)
      // NEO miss distances reach into millions of km; we apply the same log
      // compression used by planets/asteroids so close approaches near Earth
      // and distant flybys both render within the camera's frustum without
      // collapsing to indistinguishable points.
      const distScene = compressKmToScene(neo.closeApproach.missDistanceKm)
      const closest = new THREE.Vector3(
        distScene * Math.cos(inc) * Math.cos(az),
        distScene * Math.sin(inc),
        distScene * Math.cos(inc) * Math.sin(az),
      )
      // Velocity: same compression scale on the tangent magnitude so motion
      // along the closest-approach line stays visually reasonable.
      const oneSecondScene =
        compressKmToScene(neo.closeApproach.missDistanceKm + neo.closeApproach.relativeVelocityKmS) - distScene
      const speedScenePerSec = Math.max(0, oneSecondScene)
      const tangent = new THREE.Vector3()
      // Build orthonormal basis around closest direction. Compare the
      // *normalized* y component against the parallelism cutoff so the swap
      // fires correctly regardless of `dist` magnitude.
      const closestLen = closest.length() || 1
      const yHat = Math.abs(closest.y / closestLen)
      const up = yHat < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
      tangent.copy(closest).normalize().cross(up).normalize().multiplyScalar(speedScenePerSec)
      tracks.push({ neo, closestPoint: closest, velocity: tangent, epochMs: neo.closeApproach.epochUnixMs })
      i++
      if (i >= MAX * 2) break
    }
  }

  const _scratchPos = new THREE.Vector3()

  function update(date: Date) {
    let nIdx = 0
    let hIdx = 0
    const t = date.getTime()
    for (const tr of tracks) {
      const dt = (t - tr.epochMs) / 1000
      _scratchPos.copy(tr.velocity).multiplyScalar(dt).add(tr.closestPoint)
      let cached = positions.get(tr.neo.id)
      if (!cached) {
        cached = new THREE.Vector3()
        positions.set(tr.neo.id, cached)
      }
      cached.copy(_scratchPos)
      dummy.position.copy(_scratchPos)
      const size = Math.max(0.6, Math.log10(tr.neo.estimatedDiameterMetersMax + 10) * 0.5)
      dummy.scale.setScalar(size)
      dummy.updateMatrix()
      if (tr.neo.isPotentiallyHazardous) {
        if (hIdx < MAX) meshHazard.setMatrixAt(hIdx++, dummy.matrix)
      } else {
        if (nIdx < MAX) meshNormal.setMatrixAt(nIdx++, dummy.matrix)
      }
    }
    meshNormal.count = nIdx
    meshHazard.count = hIdx
    meshNormal.instanceMatrix.needsUpdate = true
    meshHazard.instanceMatrix.needsUpdate = true
  }

  function setVisible(v: boolean) {
    group.visible = v
  }

  function pickById(id: string): NearEarthObject | null {
    return tracks.find((tr) => tr.neo.id === id)?.neo ?? null
  }

  function positionOf(id: string): THREE.Vector3 | null {
    return positions.get(id) ?? null
  }

  function dispose() {
    sphereGeom.dispose()
    matNormal.dispose()
    matHazard.dispose()
  }

  return {
    group,
    setNeos,
    update,
    setVisible,
    list: () => tracks.map((t) => t.neo),
    pickById,
    positionOf,
    dispose,
  }
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
