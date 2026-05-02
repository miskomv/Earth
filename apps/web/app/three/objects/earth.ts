import * as THREE from 'three'
import { earthVertexShader, earthFragmentShader } from '../shaders/earth.js'
import { atmosphereVertexShader, atmosphereFragmentShader } from '../shaders/atmosphere.js'
import { loadEarthTexture } from '../textures.js'
import { gmstRad } from '../math/time.js'
import { sunDirectionScene } from '../math/sun.js'
import { SCENE_EARTH_RADIUS } from '@universe/shared'

export interface EarthSystem {
  group: THREE.Group
  earthMesh: THREE.Mesh
  atmosphereMesh: THREE.Mesh
  sunDir: THREE.Vector3
  setTime(date: Date): void
  /** Toggle clouds: only mutes the cloud sampler in the Earth shader (no parallax sphere). */
  setCloudsEnabled(enabled: boolean): void
  dispose(): void
}

export function createEarthSystem(): EarthSystem {
  const group = new THREE.Group()
  group.name = 'EarthSystem'

  // Earth textures: each returns a synchronous placeholder + a `ready` promise
  // that resolves with the real texture once it loads from CDN. We swap the
  // material's uniform on each `ready` so the shader picks up the real image
  // exactly when it lands — no reliance on in-place mutation of `image`.
  const day = loadEarthTexture('day')
  const night = loadEarthTexture('night')
  const specular = loadEarthTexture('specular')
  const normal = loadEarthTexture('normal')
  const cloudsStatic = loadEarthTexture('cloudsStatic')

  const earthMaterial = new THREE.ShaderMaterial({
    vertexShader: earthVertexShader,
    fragmentShader: earthFragmentShader,
    uniforms: {
      dayTex: { value: day.texture },
      nightTex: { value: night.texture },
      specularTex: { value: specular.texture },
      normalTex: { value: normal.texture },
      cloudsTex: { value: cloudsStatic.texture },
      hasNight: { value: 1 },
      hasSpecular: { value: 1 },
      hasNormal: { value: 1 },
      hasClouds: { value: 1 },
      cloudOpacity: { value: 0.6 },
      cloudUvOffset: { value: 0 },
      sunDirView: { value: new THREE.Vector3(1, 0, 0) },
      time: { value: 0 },
    },
  })

  // Track loaded textures so we can dispose them on teardown.
  const loadedTextures: THREE.Texture[] = []
  function swapUniform(uniformName: string, ready: Promise<THREE.Texture>) {
    ready.then((tex) => {
      const u = earthMaterial.uniforms[uniformName]
      if (u) {
        u.value = tex
        loadedTextures.push(tex)
      }
    }).catch(() => {
      /* placeholder remains in the uniform — fallback color shows */
    })
  }
  swapUniform('dayTex', day.ready)
  swapUniform('nightTex', night.ready)
  swapUniform('specularTex', specular.ready)
  swapUniform('normalTex', normal.ready)
  swapUniform('cloudsTex', cloudsStatic.ready)

  // We previously tried wiring the GIBS WMS daily TrueColor as the dayTex,
  // but MODIS Terra's polar orbit leaves visible north-south swath gaps in
  // the daily composite (the satellite hasn't covered every longitude in 24
  // hours). The fix would require multi-satellite mosaicking that GIBS does
  // not expose as a single layer; for now the static Blue Marble + the
  // separate drifting cloud overlay are the cleanest visual result.

  const earthGeom = new THREE.SphereGeometry(SCENE_EARTH_RADIUS, 128, 128)
  const earthMesh = new THREE.Mesh(earthGeom, earthMaterial)
  earthMesh.name = 'Earth'
  group.add(earthMesh)

  // Clouds are rendered as a single shader-projected pass on the Earth
  // surface (see earth.ts fragment shader). We previously had a separate
  // parallax cloud sphere on top of it, but the two layers showed the same
  // pattern at slightly offset radii — the user perceived it as a duplicated
  // double-image. The shader pass alone is now the single source of truth;
  // independent advection comes from `cloudUvOffset` (longitude UV drift).

  // Atmosphere
  const atmoMaterial = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    uniforms: {
      sunDirView: { value: new THREE.Vector3(1, 0, 0) },
      atmoColor: { value: new THREE.Color(0.35, 0.55, 1.0) },
      intensity: { value: 1.5 },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const atmoGeom = new THREE.SphereGeometry(SCENE_EARTH_RADIUS * 1.045, 96, 96)
  const atmosphereMesh = new THREE.Mesh(atmoGeom, atmoMaterial)
  atmosphereMesh.name = 'Atmosphere'
  atmosphereMesh.renderOrder = 2
  group.add(atmosphereMesh)

  const sunDir = new THREE.Vector3(1, 0, 0)

  /**
   * Cloud UV drift in longitude, driven by *wall* time so playback state
   * (paused / live) doesn't make clouds race or freeze unrealistically.
   * Units: UV per wall-second. The texture covers 360° of longitude across
   * U=[0,1], so 1/2160 ≈ 0.000463 ≈ a full UV cycle every 36 minutes wall
   * time. Subtle but visibly drifting if the user watches for ~10 s.
   */
  const CLOUD_UV_DRIFT_PER_WALL_SEC = 1 / 2160

  function setTime(date: Date) {
    const gmst = gmstRad(date)
    earthMesh.rotation.y = gmst
    const wallSec = performance.now() / 1000
    const offset = (wallSec * CLOUD_UV_DRIFT_PER_WALL_SEC) % 1
    const cloudUvOffsetUniform = earthMaterial.uniforms.cloudUvOffset
    if (cloudUvOffsetUniform) cloudUvOffsetUniform.value = offset
    sunDirectionScene(date, sunDir)

    const timeUniform = earthMaterial.uniforms.time
    if (timeUniform) timeUniform.value = date.getTime() / 1000
  }

  function setCloudsEnabled(enabled: boolean) {
    const u = earthMaterial.uniforms.hasClouds
    if (u) u.value = enabled ? 1 : 0
  }

  function dispose() {
    earthGeom.dispose()
    atmoGeom.dispose()
    earthMaterial.dispose()
    atmoMaterial.dispose()
    day.texture.dispose()
    night.texture.dispose()
    specular.texture.dispose()
    normal.texture.dispose()
    cloudsStatic.texture.dispose()
    for (const t of loadedTextures) t.dispose()
  }

  return { group, earthMesh, atmosphereMesh, sunDir, setTime, setCloudsEnabled, dispose }
}

const _sunDirView = new THREE.Vector3()

/** Update both shaders' view-space sun direction. Call once per frame. */
export function updateSunDirView(
  earth: EarthSystem,
  camera: THREE.Camera,
): void {
  _sunDirView.copy(earth.sunDir).transformDirection(camera.matrixWorldInverse)
  const earthMat = earth.earthMesh.material as THREE.ShaderMaterial
  const atmoMat = earth.atmosphereMesh.material as THREE.ShaderMaterial
  earthMat.uniforms.sunDirView?.value.copy(_sunDirView)
  atmoMat.uniforms.sunDirView?.value.copy(_sunDirView)
}
