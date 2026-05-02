import * as THREE from 'three'
import { Body, GeoVector } from 'astronomy-engine'
import { compressVector } from '../math/distanceCompress.js'
import { AU_KM } from '@universe/shared'

const SUN_RADIUS_KM = 695_700
/**
 * The Sun's TRUE radius is ~109× Earth's. At its compressed distance (~570
 * scene units) a 109-unit-radius disc would still be too small for a strong
 * "presence". We scale the sphere visually so it reads as a small bright disc
 * against the starfield, then a wide additive corona halo around it.
 */
const SUN_VISUAL_RADIUS = 12

export interface SunLayer {
  group: THREE.Group
  update(date: Date): void
  setVisible(v: boolean): void
  position: THREE.Vector3
  dispose(): void
}

export function createSunLayer(): SunLayer {
  const group = new THREE.Group()
  group.name = 'Sun'

  // Bright core sphere.
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xfff2c0,
    toneMapped: false,
  })
  const coreGeom = new THREE.SphereGeometry(SUN_VISUAL_RADIUS, 32, 32)
  const core = new THREE.Mesh(coreGeom, coreMat)
  group.add(core)

  // Corona / halo using a billboard plane with radial gradient shader.
  const coronaSize = SUN_VISUAL_RADIUS * 6
  const coronaGeom = new THREE.PlaneGeometry(coronaSize, coronaSize)
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: {
      coreColor: { value: new THREE.Color(1.0, 0.92, 0.65) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform vec3 coreColor;
      void main() {
        vec2 c = vUv - 0.5;
        float d = length(c) * 2.0;
        float fall = pow(max(0.0, 1.0 - d), 2.5);
        // Brighter core glow + slow falloff outer haze.
        float core = pow(max(0.0, 1.0 - d * 1.4), 6.0) * 1.8;
        gl_FragColor = vec4(coreColor, fall * 0.55 + core * 0.45);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const corona = new THREE.Mesh(coronaGeom, coronaMat)
  corona.renderOrder = 5
  group.add(corona)

  const position = new THREE.Vector3()
  const _kmIn = { x: 0, y: 0, z: 0 }
  const _sceneOut = { x: 0, y: 0, z: 0 }

  function update(date: Date) {
    // GeoVector returns AU in J2000 mean equator. Convert to km, then apply
    // distance compression (which writes scene units), then axis swap into
    // the scene frame (scene.X = eq.X, scene.Y = eq.Z, scene.Z = -eq.Y).
    const v = GeoVector(Body.Sun, date, false)
    _kmIn.x = v.x * AU_KM
    _kmIn.y = v.y * AU_KM
    _kmIn.z = v.z * AU_KM
    compressVector(_kmIn, _sceneOut)
    position.set(_sceneOut.x, _sceneOut.z, -_sceneOut.y)
    group.position.copy(position)
  }

  function setVisible(v: boolean) {
    group.visible = v
  }

  function dispose() {
    coreGeom.dispose()
    coreMat.dispose()
    coronaGeom.dispose()
    coronaMat.dispose()
  }

  // Expose corona so the scene loop can billboard it.
  ;(group as THREE.Group & { corona: THREE.Mesh }).corona = corona

  return { group, update, setVisible, position, dispose }
}

/** Re-orient the corona billboard toward the camera each frame. */
export function orientSunCorona(layer: SunLayer, camera: THREE.Camera): void {
  const corona = (layer.group as THREE.Group & { corona?: THREE.Mesh }).corona
  if (!corona) return
  // World-space target = camera world position.
  corona.lookAt(camera.position)
}
