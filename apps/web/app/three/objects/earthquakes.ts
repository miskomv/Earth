import * as THREE from 'three'
import type { Earthquake } from '@universe/shared'
import { geodeticToVec3 } from '../math/coords.js'
import { gmstRad } from '../math/time.js'

export interface EarthquakesLayer {
  group: THREE.Group
  setQuakes(list: Earthquake[]): void
  update(date: Date): void
  setVisible(v: boolean): void
  list(): Earthquake[]
  positionOf(id: string): THREE.Vector3 | null
  dispose(): void
}

/** Pulsing rings whose radius and color encode magnitude and recency. */
export function createEarthquakesLayer(): EarthquakesLayer {
  const group = new THREE.Group()
  group.name = 'Earthquakes'

  const ringTex = makeRingTexture(96)
  /** Single shared geometry — sprites scale via `mesh.scale`. */
  const sharedPlaneGeom = new THREE.PlaneGeometry(0.04, 0.04)

  const entries = new Map<string, { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; q: Earthquake }>()
  let quakes: Earthquake[] = []
  const positions = new Map<string, THREE.Vector3>()

  function setQuakes(list: Earthquake[]) {
    quakes = list
    const present = new Set(list.map((q) => q.id))
    for (const [id, e] of entries) {
      if (!present.has(id)) {
        group.remove(e.mesh)
        e.mat.dispose()
        entries.delete(id)
        positions.delete(id)
      }
    }
    for (const q of list) {
      let entry = entries.get(q.id)
      const color = magnitudeColor(q.magnitude)
      if (!entry) {
        const mat = new THREE.MeshBasicMaterial({
          map: ringTex,
          transparent: true,
          color,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
        const mesh = new THREE.Mesh(sharedPlaneGeom, mat)
        mesh.userData.id = q.id
        group.add(mesh)
        entry = { mesh, mat, q }
        entries.set(q.id, entry)
      } else {
        entry.mat.color.setHex(color)
        entry.q = q
      }
    }
  }

  const _surface = new THREE.Vector3()
  const _outward = new THREE.Vector3()

  function update(date: Date) {
    const gmst = gmstRad(date)
    const cos = Math.cos(gmst)
    const sin = Math.sin(gmst)
    // Pulse uses *wall-clock* so it stays a steady visual cadence regardless
    // of sim-time scale (paused, 1×, or 1mo/s — all pulse at the same rate).
    // Recency fade still uses sim-time so paused timelines stay paused.
    const wallNow = performance.now()
    const simNow = date.getTime()
    const phase = ((wallNow / 1000) % 2) / 2 // 0..1 every 2 s

    for (const [id, entry] of entries) {
      const q = entry.q
      geodeticToVec3(q.position.lat, q.position.lon, 5, _surface)
      const x = _surface.x * cos + _surface.z * sin
      const z = -_surface.x * sin + _surface.z * cos
      _surface.x = x
      _surface.z = z
      entry.mesh.position.copy(_surface)
      _outward.copy(_surface).multiplyScalar(2)
      entry.mesh.lookAt(_outward)
      const ageHours = Math.max(0, (simNow - q.epochUnixMs) / 3600000)
      const baseSize = 0.6 + Math.max(0, q.magnitude - 2.5) * 0.6
      const pulse = 1 + phase * 1.5
      entry.mesh.scale.setScalar(baseSize * pulse)
      const fade = Math.max(0.15, 1 - ageHours / 24)
      entry.mat.opacity = (1 - phase) * fade
      let p = positions.get(id)
      if (!p) {
        p = new THREE.Vector3()
        positions.set(id, p)
      }
      p.copy(_surface)
    }
  }

  function setVisible(v: boolean) {
    group.visible = v
  }

  function dispose() {
    sharedPlaneGeom.dispose()
    ringTex.dispose()
    for (const e of entries.values()) e.mat.dispose()
    entries.clear()
  }

  return {
    group,
    setQuakes,
    update,
    setVisible,
    list: () => quakes,
    positionOf: (id) => positions.get(id) ?? null,
    dispose,
  }
}

function magnitudeColor(m: number): number {
  if (m >= 7) return 0xff2020
  if (m >= 6) return 0xff7a20
  if (m >= 5) return 0xffc04d
  if (m >= 4) return 0xfff080
  return 0xa0e0ff
}

function makeRingTexture(size: number): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  const cx = size / 2
  const cy = size / 2
  // Outer fading ring.
  const grd = ctx.createRadialGradient(cx, cy, size * 0.18, cx, cy, size * 0.48)
  grd.addColorStop(0, 'rgba(255,255,255,0.0)')
  grd.addColorStop(0.7, 'rgba(255,255,255,0.95)')
  grd.addColorStop(1, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, size, size)
  // Center dot.
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.07, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,1)'
  ctx.fill()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
