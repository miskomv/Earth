import * as THREE from 'three'

/**
 * Texture sources. We use jsDelivr-hosted assets from the well-tested
 * three-globe project (CORS-safe, edge-cached). The day texture additionally
 * supports an override via the API's GIBS proxy for live daily imagery.
 *
 * The loader returns the placeholder synchronously (so materials/uniforms can
 * point at a valid `Texture` immediately) and runs an `onLoad` callback when
 * the real asset arrives. Callers are expected to swap the loaded texture
 * into the material's uniform on load — that's much more reliable than
 * mutating the placeholder's `.image` field, which has subtle gotchas around
 * Three.js's `Source` versioning.
 */

const THREE_GLOBE_BASE =
  'https://cdn.jsdelivr.net/gh/vasturiano/three-globe@master/example/img'

// three-globe doesn't ship a cloud texture, so we source the high-res
// (4096×2048, true RGBA alpha) clouds composite from turban/webgl-earth
// — CORS-safe via jsDelivr, ~5 MB, edge-cached.
const TURBAN_BASE = 'https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images'

export const TEXTURE_URLS = {
  day: `${THREE_GLOBE_BASE}/earth-blue-marble.jpg`,
  night: `${THREE_GLOBE_BASE}/earth-night.jpg`,
  specular: `${THREE_GLOBE_BASE}/earth-water.png`,
  normal: `${THREE_GLOBE_BASE}/earth-topology.png`,
  cloudsStatic: `${TURBAN_BASE}/fair_clouds_4k.png`,
  stars: `${THREE_GLOBE_BASE}/night-sky.png`,
  moon: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/textures/planets/moon_1024.jpg',
} as const

/**
 * Bright fallback colors. We use saturated tones (not just dark blue) so a
 * load failure produces a clearly-visible Earth-like ball at every camera
 * angle rather than a near-black sphere that disappears against the
 * background — makes failure modes diagnose-able instead of looking like
 * "nothing rendered".
 */
const FALLBACK_COLORS = {
  day: '#3b6ba5',
  night: '#0a1428',
  specular: '#0a0a0a',
  normal: '#8080ff',
  cloudsStatic: '#00000000',
  stars: '#040814',
  moon: '#9a958e',
} as const

function colorTexture(hex: string, key: TextureKey): THREE.Texture {
  if (typeof document === 'undefined') {
    const t = new THREE.Texture()
    t.colorSpace = key === 'normal' ? THREE.NoColorSpace : THREE.SRGBColorSpace
    return t
  }
  const c = document.createElement('canvas')
  c.width = c.height = 4
  const ctx = c.getContext('2d')!
  ctx.fillStyle = hex
  ctx.fillRect(0, 0, 4, 4)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = key === 'normal' ? THREE.NoColorSpace : THREE.SRGBColorSpace
  return tex
}

export type TextureKey = keyof typeof TEXTURE_URLS

export interface EarthTexture {
  /** Synchronously-available placeholder; valid for use as a sampler from frame 1. */
  texture: THREE.Texture
  /** Resolves once the real image has loaded (or rejects on hard failure). */
  ready: Promise<THREE.Texture>
}

/**
 * Load a texture. Returns the placeholder synchronously plus a Promise that
 * resolves to the real loaded texture. Callers should `await ready` and swap
 * the material/uniform reference once the real asset arrives.
 */
export function loadEarthTexture(key: TextureKey, anisotropy = 8): EarthTexture {
  const placeholder = colorTexture(FALLBACK_COLORS[key], key)
  placeholder.anisotropy = anisotropy

  if (typeof window === 'undefined') {
    return { texture: placeholder, ready: Promise.resolve(placeholder) }
  }

  const ready = new Promise<THREE.Texture>((resolve, reject) => {
    const loader = new THREE.TextureLoader()
    loader.crossOrigin = 'anonymous'
    loader.load(
      TEXTURE_URLS[key],
      (loaded) => {
        loaded.colorSpace = key === 'normal' ? THREE.NoColorSpace : THREE.SRGBColorSpace
        loaded.anisotropy = anisotropy
        loaded.needsUpdate = true
        resolve(loaded)
      },
      undefined,
      (err) => {
        console.warn(`[textures] failed to load ${key} (${TEXTURE_URLS[key]}):`, err)
        reject(err)
      },
    )
  })

  return { texture: placeholder, ready }
}
