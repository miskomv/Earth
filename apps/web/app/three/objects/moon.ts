import * as THREE from 'three'
import { Body, GeoVector } from 'astronomy-engine'
import { AU_KM, KM_TO_SCENE } from '@universe/shared'
import { loadEarthTexture } from '../textures.js'

const MOON_RADIUS_KM = 1737.4
const MOON_RADIUS_SCENE = MOON_RADIUS_KM * KM_TO_SCENE // ≈ 0.272

export interface MoonLayer {
  group: THREE.Group
  update(date: Date): void
  setVisible(v: boolean): void
  position: THREE.Vector3
  dispose(): void
}

/**
 * The Moon, rendered at TRUE physical scale (radius ≈ 0.272 scene units,
 * ~60 units from Earth). astronomy-engine's GeoVector returns J2000 mean
 * equatorial AU; we apply the same axis swap as the Sun helper to map into
 * the scene frame.
 *
 * The Moon is lit by the same Sun direction the Earth uses; we colorize the
 * lit hemisphere via a tiny ShaderMaterial so phases are visible (full moon
 * vs new moon) when the geometry has the Sun on the opposite side.
 */
export function createMoonLayer(getSunDir: () => THREE.Vector3): MoonLayer {
  const group = new THREE.Group()
  group.name = 'Moon'

  const moonHandle = loadEarthTexture('moon')
  const loaded: THREE.Texture[] = []

  const material = new THREE.ShaderMaterial({
    uniforms: {
      moonTex: { value: moonHandle.texture },
      sunDirView: { value: new THREE.Vector3(1, 0, 0) },
      ambient: { value: 0.04 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      void main() {
        vUv = uv;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D moonTex;
      uniform vec3 sunDirView;
      uniform float ambient;
      varying vec2 vUv;
      varying vec3 vNormalView;
      void main() {
        vec3 base = texture2D(moonTex, vUv).rgb;
        float ndl = max(dot(normalize(vNormalView), normalize(sunDirView)), 0.0);
        // Smooth phase boundary; ambient floor so the dark side isn't pitch black.
        float lit = smoothstep(-0.02, 0.05, ndl - 0.0);
        gl_FragColor = vec4(base * (ambient + (1.0 - ambient) * lit), 1.0);
      }
    `,
  })

  moonHandle.ready.then((tex) => {
    material.uniforms.moonTex!.value = tex
    loaded.push(tex)
  }).catch(() => { /* placeholder */ })

  const geom = new THREE.SphereGeometry(MOON_RADIUS_SCENE, 48, 48)
  const mesh = new THREE.Mesh(geom, material)
  mesh.name = 'MoonMesh'
  group.add(mesh)

  const position = new THREE.Vector3()
  const _sunView = new THREE.Vector3()

  function update(date: Date) {
    // GeoVector returns geocentric position in equatorial AU.
    const v = GeoVector(Body.Moon, date, false)
    const xKm = v.x * AU_KM
    const yKm = v.y * AU_KM
    const zKm = v.z * AU_KM
    // Same axis swap as sunPositionScene: scene (x, z, -y).
    position.x = xKm * KM_TO_SCENE
    position.y = zKm * KM_TO_SCENE
    position.z = -yKm * KM_TO_SCENE
    mesh.position.copy(position)

    // The Sun direction here is in world-space (from earth.sunDir). The
    // shader uses view-space; let the renderer wrapper push the view-space
    // version each frame via setSunDirView below.
  }

  function setSunDirView(viewSpaceDir: THREE.Vector3) {
    material.uniforms.sunDirView!.value.copy(viewSpaceDir)
  }

  // Expose to allow scene.ts to push the view-space sun dir alongside Earth.
  ;(group as THREE.Group & { setSunDirView: (d: THREE.Vector3) => void }).setSunDirView = setSunDirView
  void getSunDir
  void _sunView

  function setVisible(v: boolean) {
    group.visible = v
  }

  function dispose() {
    geom.dispose()
    material.dispose()
    moonHandle.texture.dispose()
    for (const t of loaded) t.dispose()
  }

  return { group, update, setVisible, position, dispose }
}

/** Helper to push view-space sun dir from the scene's per-frame loop. */
export function setMoonSunDirView(layer: MoonLayer, viewSpaceDir: THREE.Vector3): void {
  const f = (layer.group as THREE.Group & { setSunDirView?: (d: THREE.Vector3) => void }).setSunDirView
  if (f) f(viewSpaceDir)
}
