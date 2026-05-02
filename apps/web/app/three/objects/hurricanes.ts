import * as THREE from 'three'
import type { ActiveHurricane } from '@universe/shared'
import { geodeticToVec3 } from '../math/coords.js'
import { gmstRad } from '../math/time.js'

export interface HurricanesLayer {
  group: THREE.Group
  setStorms(list: ActiveHurricane[]): void
  update(date: Date): void
  setVisible(v: boolean): void
  list(): ActiveHurricane[]
  positionOf(id: string): THREE.Vector3 | null
  dispose(): void
}

const CATEGORY_COLOR: Record<string, number> = {
  TD: 0x66ccff,
  TS: 0x88ddff,
  HU1: 0xffe066,
  HU2: 0xffaa44,
  HU3: 0xff7733,
  HU4: 0xff4422,
  HU5: 0xcc0000,
  EX: 0xaaaaaa,
  SS: 0x99ccff,
  SD: 0x88aacc,
  PT: 0xbbbbbb,
}

/** Animated spiral disc plus a vertical trail showing intensity. */
export function createHurricanesLayer(): HurricanesLayer {
  const group = new THREE.Group()
  group.name = 'Hurricanes'

  const RING_TEX = makeSpiralTexture(128)
  /** Single shared geometry — sprites scale via `mesh.scale`, no clones. */
  const sharedRingGeom = new THREE.PlaneGeometry(0.06, 0.06)

  const sprites = new Map<string, { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; storm: ActiveHurricane }>()
  let storms: ActiveHurricane[] = []
  const positions = new Map<string, THREE.Vector3>()
  /** Spin speed of the spiral icons, radians per second of *real* wall time. */
  const SPIN_RAD_PER_SEC = 1.4
  let lastTickMs = performance.now()
  /** Accumulated spin angle so all sprites stay phase-aligned across frames. */
  let spinAngle = 0

  function setStorms(list: ActiveHurricane[]) {
    storms = list
    const presentIds = new Set(list.map((s) => s.id))
    for (const [id, entry] of sprites) {
      if (!presentIds.has(id)) {
        group.remove(entry.mesh)
        entry.mat.dispose()
        sprites.delete(id)
        positions.delete(id)
      }
    }
    for (const storm of list) {
      let entry = sprites.get(storm.id)
      const color = CATEGORY_COLOR[storm.category] ?? 0xffffff
      if (!entry) {
        const mat = new THREE.MeshBasicMaterial({
          map: RING_TEX,
          transparent: true,
          color,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
        const mesh = new THREE.Mesh(sharedRingGeom, mat)
        mesh.userData.id = storm.id
        group.add(mesh)
        entry = { mesh, mat, storm }
        sprites.set(storm.id, entry)
      } else {
        entry.mat.color.setHex(color)
        entry.storm = storm
      }
      const size = stormSize(storm)
      entry.mesh.scale.setScalar(size)
    }
  }

  const _surface = new THREE.Vector3()
  const _outward = new THREE.Vector3()

  function update(date: Date) {
    const gmst = gmstRad(date)
    const cos = Math.cos(gmst)
    const sin = Math.sin(gmst)
    // Frame-rate-independent spin.
    const nowMs = performance.now()
    const dtSec = Math.min(0.1, Math.max(0, (nowMs - lastTickMs) / 1000))
    lastTickMs = nowMs
    spinAngle = (spinAngle + dtSec * SPIN_RAD_PER_SEC) % (Math.PI * 2)

    for (const [id, entry] of sprites) {
      geodeticToVec3(entry.storm.position.lat, entry.storm.position.lon, 30, _surface)
      const x = _surface.x * cos + _surface.z * sin
      const z = -_surface.x * sin + _surface.z * cos
      _surface.x = x
      _surface.z = z
      entry.mesh.position.copy(_surface)
      // Orient normal away from Earth's center.
      _outward.copy(_surface).multiplyScalar(2)
      entry.mesh.lookAt(_outward)
      entry.mesh.rotation.z = spinAngle
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
    // Re-anchor the spin clock so the next visible frame doesn't pop forward
    // by the entire hidden duration (clamped to 0.1 s, but still a visible
    // jolt of up to ~8°).
    if (v) lastTickMs = performance.now()
  }

  function dispose() {
    sharedRingGeom.dispose()
    RING_TEX.dispose()
    for (const entry of sprites.values()) entry.mat.dispose()
    sprites.clear()
  }

  return {
    group,
    setStorms,
    update,
    setVisible,
    list: () => storms,
    positionOf: (id) => positions.get(id) ?? null,
    dispose,
  }
}

function stormSize(s: ActiveHurricane): number {
  const cat = s.category
  if (cat === 'HU5') return 5
  if (cat === 'HU4') return 4
  if (cat === 'HU3') return 3.3
  if (cat === 'HU2') return 2.7
  if (cat === 'HU1') return 2.2
  if (cat === 'TS' || cat === 'SS') return 1.6
  return 1.2
}

function makeSpiralTexture(size: number): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const cx = size / 2
  const cy = size / 2
  const maxR = size * 0.46
  ctx.clearRect(0, 0, size, size)
  // Soft halo.
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR)
  grd.addColorStop(0, 'rgba(255,255,255,0.9)')
  grd.addColorStop(0.4, 'rgba(255,255,255,0.18)')
  grd.addColorStop(1, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, size, size)
  // Spiral arms.
  ctx.translate(cx, cy)
  ctx.lineWidth = 2
  for (let arm = 0; arm < 2; arm++) {
    ctx.beginPath()
    for (let t = 0; t < Math.PI * 4; t += 0.05) {
      const r = (t / (Math.PI * 4)) * maxR
      const a = t + arm * Math.PI
      const x = r * Math.cos(a)
      const y = r * Math.sin(a)
      if (t === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.stroke()
  }
  // Eye dot.
  ctx.beginPath()
  ctx.arc(0, 0, size * 0.04, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fill()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
