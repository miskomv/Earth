import * as THREE from 'three'
import { loadEarthTexture } from '../textures.js'

export interface Starfield {
  group: THREE.Group
  dispose(): void
}

/** Procedural starfield + a Milky Way background sky-sphere texture. */
export function createStarfield(): Starfield {
  const group = new THREE.Group()
  group.name = 'Stars'

  // Sky sphere (Milky Way)
  const skyHandle = loadEarthTexture('stars')
  skyHandle.texture.colorSpace = THREE.SRGBColorSpace
  skyHandle.texture.mapping = THREE.EquirectangularReflectionMapping
  const skyGeom = new THREE.SphereGeometry(1000, 64, 64)
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyHandle.texture,
    side: THREE.BackSide,
    depthWrite: false,
    color: 0x6080a0,
  })
  let loadedSkyTex: THREE.Texture | null = null
  skyHandle.ready.then((tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping
    skyMat.map = tex
    skyMat.needsUpdate = true
    loadedSkyTex = tex
  }).catch(() => { /* placeholder remains */ })
  const sky = new THREE.Mesh(skyGeom, skyMat)
  sky.renderOrder = -10
  group.add(sky)

  // Bright procedural stars in front of the sky.
  const starCount = 4000
  const positions = new Float32Array(starCount * 3)
  const colors = new Float32Array(starCount * 3)
  const sizes = new Float32Array(starCount)
  const rng = mulberry32(12345)
  for (let i = 0; i < starCount; i++) {
    const theta = rng() * Math.PI * 2
    const phi = Math.acos(2 * rng() - 1)
    const r = 800
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.cos(phi)
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    const t = rng()
    // Color biased to white/blue/yellow.
    if (t < 0.7) {
      colors[i * 3] = 1
      colors[i * 3 + 1] = 1
      colors[i * 3 + 2] = 1
    } else if (t < 0.9) {
      colors[i * 3] = 0.8
      colors[i * 3 + 1] = 0.85
      colors[i * 3 + 2] = 1
    } else {
      colors[i * 3] = 1
      colors[i * 3 + 1] = 0.9
      colors[i * 3 + 2] = 0.7
    }
    sizes[i] = 0.4 + rng() * 1.4
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  const mat = new THREE.PointsMaterial({
    size: 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geom, mat)
  points.renderOrder = -5
  group.add(points)

  function dispose() {
    skyGeom.dispose()
    skyMat.dispose()
    skyHandle.texture.dispose()
    if (loadedSkyTex) loadedSkyTex.dispose()
    geom.dispose()
    mat.dispose()
  }

  return { group, dispose }
}

function mulberry32(seed: number): () => number {
  let t = seed
  return function () {
    t |= 0
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
