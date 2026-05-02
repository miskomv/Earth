import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createEarthSystem, updateSunDirView, type EarthSystem } from './objects/earth.js'
import { createStarfield } from './objects/stars.js'
import { createSatellitesLayer, type SatellitesLayer } from './objects/satellites.js'
import { createIssLayer, type IssLayer } from './objects/iss.js'
import { createSmallBodiesLayer, type SmallBodiesLayer } from './objects/smallBodies.js'
import { createNeosLayer, type NeosLayer } from './objects/neos.js'
import { createHurricanesLayer, type HurricanesLayer } from './objects/hurricanes.js'
import { createEarthquakesLayer, type EarthquakesLayer } from './objects/earthquakes.js'
import { createMoonLayer, setMoonSunDirView, type MoonLayer } from './objects/moon.js'
import { createSunLayer, orientSunCorona, type SunLayer } from './objects/sun.js'
import { createPlanetsLayer, type PlanetsLayer } from './objects/planets.js'
import { createUserMarkerLayer, type UserMarkerLayer } from './objects/userMarker.js'

export interface SceneState {
  /** Multiplier on real time. 1 = realtime; 0 = paused. */
  timeScale: number
  /** Wall-clock anchor: at lastSyncWall, simTime equals lastSyncSim. */
  lastSyncWall: number
  lastSyncSim: number
}

export interface SceneApi {
  domElement: HTMLCanvasElement
  controls: OrbitControls
  earth: EarthSystem
  stars: THREE.Group
  satellites: SatellitesLayer
  iss: IssLayer
  smallBodies: SmallBodiesLayer
  neos: NeosLayer
  hurricanes: HurricanesLayer
  earthquakes: EarthquakesLayer
  moon: MoonLayer
  sun: SunLayer
  planets: PlanetsLayer
  userMarker: UserMarkerLayer
  state: SceneState
  /** Returns the current simulated Date based on state. */
  getSimDate(): Date
  setTimeScale(scale: number): void
  /** Hard-set the simulated time. */
  setSimTime(date: Date): void
  resize(): void
  start(): void
  stop(): void
  dispose(): void
  /** Raycast against pickable layers; returns {kind,id} or null. */
  pick(ndc: { x: number; y: number }): PickHit | null
  /** Animate camera to focus on a scene-space point. */
  focus(point: THREE.Vector3, distance?: number): void
}

export type PickHit =
  | { kind: 'satellite'; index: number }
  | { kind: 'iss' }
  | { kind: 'asteroid'; spkid: string }
  | { kind: 'moon' }
  | { kind: 'sun' }
  | { kind: 'planet'; name: string }
  | { kind: 'neo'; id: string }
  | { kind: 'hurricane'; id: string }
  | { kind: 'earthquake'; id: string }

export function createScene(canvas: HTMLCanvasElement): SceneApi {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000008)

  const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.001, 5000)
  camera.position.set(0, 0.7, 3.2)

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.minDistance = 1.05
  // Wide enough to encompass the Sun (~573 units) and Saturn (~770 units)
  // through our log-distance compression while still allowing close-up of
  // ground-level features.
  controls.maxDistance = 1000
  controls.rotateSpeed = 0.55
  controls.zoomSpeed = 0.9
  controls.panSpeed = 0.4
  controls.enablePan = true

  // Layers
  const starfield = createStarfield()
  scene.add(starfield.group)

  const earth = createEarthSystem()
  scene.add(earth.group)

  const satellites = createSatellitesLayer(15_000)
  scene.add(satellites.group)

  const iss = createIssLayer()
  scene.add(iss.group)

  const smallBodies = createSmallBodiesLayer(64)
  scene.add(smallBodies.group)

  const neos = createNeosLayer()
  scene.add(neos.group)

  const hurricanes = createHurricanesLayer()
  scene.add(hurricanes.group)

  const earthquakes = createEarthquakesLayer()
  scene.add(earthquakes.group)

  const moon = createMoonLayer(() => earth.sunDir)
  scene.add(moon.group)

  const sun = createSunLayer()
  scene.add(sun.group)

  const planets = createPlanetsLayer()
  scene.add(planets.group)

  const userMarker = createUserMarkerLayer()
  scene.add(userMarker.group)
  // Earth's day/night/specular lighting is fully hand-rolled in the Earth
  // shader using `sunDir`; we don't add a Three.js DirectionalLight because
  // none of our materials are Lambert/PBR. Keeps the per-frame light update
  // off the hot path.

  const state: SceneState = {
    timeScale: 1,
    lastSyncWall: Date.now(),
    lastSyncSim: Date.now(),
  }

  /**
   * Reality-only timing model. Two states:
   *   - Live (timeScale = 1): sim time tracks wall clock exactly (snaps every
   *     frame, no drift accumulation).
   *   - Paused (timeScale = 0): sim time freezes at the moment of pause.
   *
   * Resuming snaps the anchor back to current wall time, so we never display
   * a sim moment that diverges from reality.
   */
  function getSimDate(): Date {
    if (state.timeScale === 0) return new Date(state.lastSyncSim)
    return new Date()
  }

  function setTimeScale(scale: number) {
    // Only 0 (paused) and 1 (live) are valid. Coerce anything else.
    const next = scale === 0 ? 0 : 1
    const now = Date.now()
    if (next === 1) {
      // Resuming live: re-sync to wall clock so we don't show stale sim time.
      state.lastSyncSim = now
      state.lastSyncWall = now
    } else {
      // Pausing: freeze the current real time as the displayed instant.
      state.lastSyncSim = now
      state.lastSyncWall = now
    }
    state.timeScale = next
  }

  function setSimTime(_date: Date) {
    // No-op in reality mode — preserved for API compatibility but cannot
    // jump sim time anywhere; live mode always shows wall clock.
    const now = Date.now()
    state.lastSyncSim = now
    state.lastSyncWall = now
  }

  function resize() {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  // Animation loop.
  let raf = 0
  let running = false

  // Reusable view-space sun direction passed to lit shaders (Earth, Moon).
  const _sunDirView = new THREE.Vector3()

  function frame() {
    if (!running) return
    raf = requestAnimationFrame(frame)
    const date = getSimDate()
    earth.setTime(date)
    updateSunDirView(earth, camera)
    // Compute view-space sun direction once per frame; share with the Moon
    // shader so its phase always matches Earth's.
    _sunDirView.copy(earth.sunDir).transformDirection(camera.matrixWorldInverse)

    if (satellites.group.visible) satellites.update(date)
    if (iss.group.visible) iss.update(date, earth.sunDir)
    if (smallBodies.group.visible) smallBodies.update(date)
    if (neos.group.visible) neos.update(date)
    if (hurricanes.group.visible) hurricanes.update(date)
    if (earthquakes.group.visible) earthquakes.update(date)
    if (moon.group.visible) {
      moon.update(date)
      setMoonSunDirView(moon, _sunDirView)
    }
    if (sun.group.visible) {
      sun.update(date)
      orientSunCorona(sun, camera)
    }
    if (planets.group.visible) planets.update(date)
    if (userMarker.group.visible) userMarker.update(date)

    if (focusTween) {
      focusTween.update()
      if (focusTween.done) focusTween = null
    }

    // Skip OrbitControls.update() while a focus tween is running. update()
    // reads camera.position into its internal spherical state, applies any
    // residual damped delta, and writes camera.position back. With our lerp
    // happening every frame, that round-trip subtly drags the camera back
    // toward its pre-tween orientation and produces visible smearing of the
    // surface textures. We resume controls only when the tween settles.
    if (!focusTween) controls.update()
    renderer.render(scene, camera)
  }

  function start() {
    if (running) return
    running = true
    raf = requestAnimationFrame(frame)
  }

  function stop() {
    running = false
    cancelAnimationFrame(raf)
  }

  function dispose() {
    stop()
    controls.dispose()
    earth.dispose()
    satellites.dispose()
    iss.dispose()
    smallBodies.dispose()
    neos.dispose()
    hurricanes.dispose()
    earthquakes.dispose()
    moon.dispose()
    sun.dispose()
    planets.dispose()
    userMarker.dispose()
    starfield.dispose()
    renderer.dispose()
  }

  // Picking.
  const raycaster = new THREE.Raycaster()
  raycaster.params.Points = { threshold: 0.02 }
  const _pickNdc = new THREE.Vector2()
  const _pickClosest = new THREE.Vector3()

  /**
   * Distance picker. The threshold scales with apparent size so an object
   * the same number of screen pixels away from the click point picks at any
   * zoom level. We approximate the on-screen pixel size as
   * `distance_to_camera * tan(fov/2) * pixelTolerance`, evaluated per object.
   */
  function pick(ndc: { x: number; y: number }): PickHit | null {
    _pickNdc.set(ndc.x, ndc.y)
    raycaster.setFromCamera(_pickNdc, camera)
    const ray = raycaster.ray
    let best: { dist: number; hit: PickHit } | null = null
    const fov = (camera.fov * Math.PI) / 180
    const tanHalfFov = Math.tan(fov / 2)
    // Roughly 24 pixels of tolerance on a 1080-tall canvas.
    const PIXEL_TOL = 24 / Math.max(1, canvas.clientHeight) * 2

    /**
     * Test whether the segment from camera to `pos` passes through Earth's
     * sphere (radius 1 in scene units). Used to filter clicks that would
     * land on objects on the far side of the planet — the user can't see
     * them, so picking them feels like ghosting through the globe.
     */
    function isOccludedByEarth(pos: THREE.Vector3): boolean {
      const dx = pos.x - camera.position.x
      const dy = pos.y - camera.position.y
      const dz = pos.z - camera.position.z
      const dd = dx * dx + dy * dy + dz * dz
      if (dd < 1e-12) return false
      // Closest approach parameter along segment (0 = camera, 1 = object).
      const tClosest = -(camera.position.x * dx + camera.position.y * dy + camera.position.z * dz) / dd
      if (tClosest <= 0 || tClosest >= 1) return false
      const cx = camera.position.x + tClosest * dx
      const cy = camera.position.y + tClosest * dy
      const cz = camera.position.z + tClosest * dz
      const dist2 = cx * cx + cy * cy + cz * cz
      // Margin of 0.99² so objects right at the limb still pick.
      return dist2 < 0.9801
    }

    function consider(pos: THREE.Vector3, hit: PickHit) {
      if (isOccludedByEarth(pos)) return
      const t = ray.closestPointToPoint(pos, _pickClosest).distanceTo(pos)
      const distCam = camera.position.distanceTo(pos)
      const threshold = Math.max(0.005, distCam * tanHalfFov * PIXEL_TOL)
      if (t < threshold && (!best || t < best.dist)) best = { dist: t, hit }
    }

    if (iss.group.visible) consider(iss.position, { kind: 'iss' })
    if (hurricanes.group.visible) {
      for (const s of hurricanes.list()) {
        const pos = hurricanes.positionOf(s.id)
        if (pos) consider(pos, { kind: 'hurricane', id: s.id })
      }
    }
    if (earthquakes.group.visible) {
      for (const q of earthquakes.list()) {
        const pos = earthquakes.positionOf(q.id)
        if (pos) consider(pos, { kind: 'earthquake', id: q.id })
      }
    }
    if (neos.group.visible) {
      for (const n of neos.list()) {
        const pos = neos.positionOf(n.id)
        if (pos) consider(pos, { kind: 'neo', id: n.id })
      }
    }
    if (smallBodies.group.visible) {
      for (const b of smallBodies.list()) {
        const pos = smallBodies.positionOf(b.spkid)
        if (pos) consider(pos, { kind: 'asteroid', spkid: b.spkid })
      }
    }
    if (moon.group.visible) consider(moon.position, { kind: 'moon' })
    if (sun.group.visible) consider(sun.position, { kind: 'sun' })
    if (planets.group.visible) {
      for (const p of planets.list()) {
        const pos = planets.positionOf(p.name)
        if (pos) consider(pos, { kind: 'planet', name: p.name })
      }
    }

    // For dense InstancedMesh layers (satellites, flights) we use Three.js's
    // built-in raycaster which knows how to test individual instances. We
    // pick the nearest hit and prefer it over the distance-based candidates
    // above only if the ray actually intersected the instance geometry.
    // TypeScript's flow analysis doesn't propagate writes from inside the
    // nested `consider` closure above, so it narrows `best` to `null` here.
    // Treat it as the explicit union type when reading.
    type Best = { dist: number; hit: PickHit } | null
    if (satellites.group.visible) {
      const hits = raycaster.intersectObject(satellites.mesh, false)
      if (hits.length > 0 && typeof hits[0]!.instanceId === 'number') {
        const hp = hits[0]!.point
        if (!isOccludedByEarth(hp)) {
          const t = camera.position.distanceTo(hp) * 0.0001
          const cur = best as Best
          if (!cur || t < cur.dist) {
            best = { dist: t, hit: { kind: 'satellite', index: hits[0]!.instanceId! } }
          }
        }
      }
    }
    return best ? (best as { dist: number; hit: PickHit }).hit : null
  }

  /**
   * Smooth orbital camera move that frames a picked point. We keep
   * `controls.target` at the origin (so OrbitControls always orbits around
   * Earth, not around the clicked thing) and rotate the camera AROUND that
   * target — not in cartesian space.
   *
   * The fast cartesian lerp we used earlier produced a "shortcut through the
   * Earth" feel: the camera traveled in a straight line through 3D space,
   * which at certain angles looked like a teleport. Spherical interpolation
   * (slerp on the direction unit-vector + lerp on radius) keeps the camera
   * on a great-circle arc around Earth — visually equivalent to a slow user
   * drag, which is what reads as "natural" given the rest of the controls.
   *
   * OrbitControls is gated off during the tween so its `update()` doesn't
   * fight our writes; it's re-enabled and synced to the new position when
   * the tween settles, so the next user drag picks up cleanly from the
   * new vantage.
   *
   * Far-away bodies (Sun, Moon, planets, distant NEOs) skip focus entirely:
   * their position would put the camera hundreds of scene units out, hiding
   * Earth and the object alike. The InfoPanel still opens, the user can
   * navigate manually.
   */
  interface FocusTween {
    fromDir: THREE.Vector3
    toDir: THREE.Vector3
    fromQuat: THREE.Quaternion
    toQuat: THREE.Quaternion
    fromRadius: number
    toRadius: number
    startMs: number
    durationMs: number
    done: boolean
    update(): void
  }
  let focusTween: FocusTween | null = null

  /** Maximum |point| (scene units) for which we'll move the camera. Beyond
   * this, the picked body is "cosmic-distance" — we just open the panel. */
  const FOCUS_MAX_DISTANCE = 40
  /** Reference axis used to express directions as quaternion rotations from a
   * canonical "up". Any unit vector works; +Y matches the rest of the scene. */
  const _focusYAxis = new THREE.Vector3(0, 1, 0)
  const _focusScratchQuat = new THREE.Quaternion()
  const _focusScratchVec = new THREE.Vector3()

  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  function focus(point: THREE.Vector3) {
    const distFromEarth = point.length()
    if (distFromEarth < 1e-6) return
    if (distFromEarth > FOCUS_MAX_DISTANCE) return

    const fromDir = camera.position.clone().sub(controls.target).normalize()
    const toDir = point.clone().multiplyScalar(1 / distFromEarth)

    const fromRadius = camera.position.distanceTo(controls.target)
    // Frame target: bring camera in if currently far, push out if currently
    // very close — pick the larger of "1.5 above the object" and "70% of
    // current distance" so we don't overshoot at high zoom levels.
    const toRadius = Math.max(distFromEarth + 1.5, fromRadius * 0.7)

    const fromQuat = new THREE.Quaternion().setFromUnitVectors(_focusYAxis, fromDir)
    const toQuat = new THREE.Quaternion().setFromUnitVectors(_focusYAxis, toDir)

    controls.target.set(0, 0, 0)
    controls.enabled = false

    // Scale duration with the angular distance: short hops feel snappy,
    // long swings around the planet read as a slow rotation.
    const angle = Math.acos(Math.max(-1, Math.min(1, fromDir.dot(toDir))))
    const durationMs = Math.max(700, Math.min(2000, 700 + angle * 800))

    const tween: FocusTween = {
      fromDir: fromDir.clone(),
      toDir: toDir.clone(),
      fromQuat,
      toQuat,
      fromRadius,
      toRadius,
      startMs: performance.now(),
      durationMs,
      done: false,
      update() {
        const t = Math.min(1, (performance.now() - this.startMs) / this.durationMs)
        const k = easeInOutCubic(t)
        // Slerp the quaternion that takes +Y → direction, then apply to +Y
        // to recover the interpolated direction. This is true spherical
        // interpolation along the great-circle arc between fromDir and toDir.
        _focusScratchQuat.copy(this.fromQuat).slerp(this.toQuat, k)
        _focusScratchVec.copy(_focusYAxis).applyQuaternion(_focusScratchQuat)
        const radius = this.fromRadius + (this.toRadius - this.fromRadius) * k
        camera.position.copy(controls.target).addScaledVector(_focusScratchVec, radius)
        // Re-aim the camera at the orbit target every frame. Without this the
        // camera position slides along the arc but its orientation stays
        // frozen at the pre-tween look direction, then snaps when controls
        // re-enable on completion. lookAt-each-frame keeps the rotation in
        // lockstep with the position swing — no end-of-tween jump.
        camera.lookAt(controls.target)
        if (t >= 1) {
          this.done = true
          controls.enabled = true
          controls.update()
        }
      },
    }
    focusTween = tween
  }

  return {
    domElement: canvas,
    controls,
    earth,
    stars: starfield.group,
    satellites,
    iss,
    smallBodies,
    neos,
    hurricanes,
    earthquakes,
    moon,
    sun,
    planets,
    userMarker,
    state,
    getSimDate,
    setTimeScale,
    setSimTime,
    resize,
    start,
    stop,
    dispose,
    pick,
    focus,
  }
}
