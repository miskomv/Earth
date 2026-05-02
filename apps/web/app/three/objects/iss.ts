import * as THREE from 'three'
import * as satellite from 'satellite.js'
import type { IssState, TleEntry } from '@universe/shared'
import { EARTH_RADIUS_KM, KM_TO_SCENE, VISUAL_SIZE_SCALE } from '@universe/shared'

/**
 * The ISS is just NORAD 25544 in the catalog — same SGP4 propagation as
 * every other satellite, except we render it big and red, with a trail.
 *
 * No HTTP polling: we extract its TLE from the same feed the satellites
 * layer consumes (`/api/tle/visual` or any group that includes `25544`).
 * SGP4 gives us position, velocity, altitude, and visibility analytically
 * — exactly the same data the previous `wheretheiss.at` endpoint served,
 * and the same algorithm it ran internally.
 */

const ISS_NORAD_ID = 25544

export interface IssLayer {
  group: THREE.Group
  /** Receives the same TLE list the satellites layer consumes; we filter NORAD 25544. */
  setTleEntries(entries: TleEntry[]): void
  /** Optional sun direction (scene frame). When provided, drives daylight/eclipsed visibility. */
  update(date: Date, sunDirScene?: THREE.Vector3): void
  setVisible(v: boolean): void
  position: THREE.Vector3
  /** Latest derived state — null until the first successful propagation. Same shape as the legacy IssState API contract. */
  getState(): IssState | null
  dispose(): void
}

export function createIssLayer(): IssLayer {
  const group = new THREE.Group()
  group.name = 'ISS'

  const geom = new THREE.SphereGeometry(VISUAL_SIZE_SCALE.iss, 16, 16)
  const mat = new THREE.MeshBasicMaterial({ color: 0xff5050 })
  const marker = new THREE.Mesh(geom, mat)
  group.add(marker)

  const haloGeom = new THREE.SphereGeometry(VISUAL_SIZE_SCALE.iss * 2.4, 16, 16)
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xff5050,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const halo = new THREE.Mesh(haloGeom, haloMat)
  group.add(halo)

  // Trail: ~256 last positions, drawn as a Line.
  const TRAIL_LEN = 256
  const trailPositions = new Float32Array(TRAIL_LEN * 3)
  const trailGeom = new THREE.BufferGeometry()
  trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3))
  trailGeom.setDrawRange(0, 0)
  const trailMat = new THREE.LineBasicMaterial({
    color: 0xff8a80,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  })
  const trail = new THREE.Line(trailGeom, trailMat)
  group.add(trail)

  let satrec: satellite.SatRec | null = null
  let trailLen = 0
  let lastTrailDateMs = 0
  let enabled = true

  const position = new THREE.Vector3()
  const _scratchEci = new THREE.Vector3()

  /**
   * Reset the trail when the sim time jumps far from the last-traced point
   * (paused → resume after long delay, or any other discontinuity).
   */
  const TRAIL_RESET_THRESHOLD_MS = 30 * 60 * 1000

  let derived: IssState | null = null

  function setTleEntries(entries: TleEntry[]) {
    const iss = entries.find((e) => e.noradId === ISS_NORAD_ID)
    if (!iss) {
      satrec = null
      return
    }
    try {
      const sat = satellite.twoline2satrec(iss.line1, iss.line2)
      if (sat.error) {
        satrec = null
        return
      }
      satrec = sat
    } catch {
      satrec = null
    }
  }

  function update(date: Date, sunDirScene?: THREE.Vector3) {
    if (!enabled || !satrec) {
      group.visible = false
      return
    }
    const pv = satellite.propagate(satrec, date)
    const pos = pv.position
    const vel = pv.velocity
    if (!pos || typeof pos === 'boolean' || !vel || typeof vel === 'boolean') {
      group.visible = false
      return
    }
    group.visible = true

    // ECI (TEME) → scene: same axis swap used by the satellites layer.
    _scratchEci.set(pos.x, pos.z, -pos.y)
    position.x = _scratchEci.x * KM_TO_SCENE
    position.y = _scratchEci.y * KM_TO_SCENE
    position.z = _scratchEci.z * KM_TO_SCENE
    marker.position.copy(position)
    halo.position.copy(position)

    // Trail update: sim-time-based threshold so paused timelines wipe the trail
    // when resumed after a gap.
    if (Math.abs(date.getTime() - lastTrailDateMs) > TRAIL_RESET_THRESHOLD_MS) {
      trailLen = 0
    }
    lastTrailDateMs = date.getTime()
    if (trailLen < TRAIL_LEN) {
      trailPositions[trailLen * 3] = position.x
      trailPositions[trailLen * 3 + 1] = position.y
      trailPositions[trailLen * 3 + 2] = position.z
      trailLen++
    } else {
      trailPositions.copyWithin(0, 3)
      trailPositions[(TRAIL_LEN - 1) * 3] = position.x
      trailPositions[(TRAIL_LEN - 1) * 3 + 1] = position.y
      trailPositions[(TRAIL_LEN - 1) * 3 + 2] = position.z
    }
    trailGeom.setDrawRange(0, trailLen)
    const posAttr = trailGeom.attributes.position
    if (posAttr) posAttr.needsUpdate = true

    // Derived state for the InfoPanel.
    const speedKmS = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z)
    const altKm = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z) - EARTH_RADIUS_KM
    // Visibility: ISS is "daylight" if the sun direction has a positive component
    // along the ISS position vector (i.e., the ISS is on the day side of Earth's
    // axis through it). For simple shadow check: ISS is eclipsed only if it's
    // both on the night side AND inside the cylindrical shadow (rough approx).
    let visibility: 'daylight' | 'eclipsed' = 'daylight'
    if (sunDirScene) {
      const dot = position.x * sunDirScene.x + position.y * sunDirScene.y + position.z * sunDirScene.z
      // ISS in Earth's shadow when its component along sun direction is
      // negative AND its perpendicular distance to the Earth-Sun line is
      // less than Earth's radius (i.e., inside the geometric shadow cylinder).
      if (dot < 0) {
        const r2 = position.x * position.x + position.y * position.y + position.z * position.z
        const perp2 = r2 - dot * dot
        const earthRadiusScene = 1.0
        if (perp2 < earthRadiusScene * earthRadiusScene) {
          visibility = 'eclipsed'
        }
      }
    }
    // Footprint: spherical-cap horizon from altitude h: r = R * arccos(R/(R+h)).
    const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm)
    const footprintKm = EARTH_RADIUS_KM * Math.acos(Math.max(-1, Math.min(1, ratio)))

    // Geodetic from ECI + GMST, for the panel.
    const gmst = satellite.gstime(date)
    const geo = satellite.eciToGeodetic(pos, gmst)
    const lat = (geo.latitude * 180) / Math.PI
    const lon = (geo.longitude * 180) / Math.PI

    derived = {
      position: { lat, lon, altKm },
      velocityKmS: speedKmS,
      visibility,
      footprintKm,
      units: 'kilometers',
      timestamp: date.toISOString(),
    }
  }

  function setVisible(v: boolean) {
    enabled = v
    group.visible = v
    if (v) {
      trailLen = 0
      trailGeom.setDrawRange(0, 0)
    }
  }

  function dispose() {
    geom.dispose()
    mat.dispose()
    haloGeom.dispose()
    haloMat.dispose()
    trailGeom.dispose()
    trailMat.dispose()
  }

  return {
    group,
    setTleEntries,
    update,
    setVisible,
    position,
    getState: () => derived,
    dispose,
  }
}
