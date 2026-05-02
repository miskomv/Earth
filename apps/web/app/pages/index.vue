<script setup lang="ts">
import { ref, computed, watch, shallowRef, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import EarthViewport from '../components/EarthViewport.vue'
import LayerToggles, { type LayersState } from '../components/LayerToggles.vue'
import TimeControls from '../components/TimeControls.vue'
import InfoPanel, { type Selection } from '../components/InfoPanel.vue'
import StatsBar from '../components/StatsBar.vue'
import LoadingIndicator from '../components/Loading.vue'
import HereControl from '../components/HereControl.vue'
import { useUniverseData } from '../composables/useUniverseData.js'
import { useGeolocation } from '../composables/useGeolocation.js'
import { findNextPass, type PassPrediction } from '../three/math/issPasses.js'
import * as satellite from 'satellite.js'
import type { SceneApi, PickHit } from '../three/scene.js'
import type { TleEntry } from '@universe/shared'

const layers = ref<LayersState>({
  satellites: true,
  iss: true,
  asteroids: true,
  asteroidOrbits: false,
  cometTails: true,
  neos: true,
  hurricanes: true,
  earthquakes: true,
  clouds: true,
  atmosphere: false,
  stars: true,
  moon: true,
  sun: true,
  planets: true,
  userMarker: false,
})

const sceneApi = shallowRef<SceneApi | null>(null)
const simTimeISO = ref(new Date().toISOString())
const timeScale = ref(1)
const liveSatCount = ref(0)
const selection = ref<Selection>(null)

const data = useUniverseData()
const geo = useGeolocation()

const stats = computed(() => ({
  // Use the scene's live count (post-parse, post-propagate-success) so the
  // displayed number matches what the user actually sees rendered.
  satellites: liveSatCount.value || (data.tle.data.value?.length ?? 0),
  asteroids: data.sbdb.data.value?.length ?? 0,
  neos: data.neos.data.value?.objects.length ?? 0,
  hurricanes: data.hurricanes.data.value?.length ?? 0,
  earthquakes: data.quakes.data.value?.length ?? 0,
}))

const isLoading = computed(() => {
  // Hide once the scene is mounted AND any one of the core feeds has resolved
  // (data OR error). This avoids both "spinner forever on offline" and "spinner
  // stuck while one feed hangs and another errored".
  if (!sceneApi.value) return true
  const anyResolved =
    !!data.tle.data.value || !!data.tle.error.value ||
    !!data.neos.data.value || !!data.neos.error.value ||
    !!data.sbdb.data.value || !!data.sbdb.error.value
  return !anyResolved
})

let hudFrame = 0

function onReady(api: SceneApi) {
  sceneApi.value = api
  api.setSimTime(new Date())

  // Drive HUD updates from rAF; refs are throttled by Vue automatically.
  const tick = () => {
    simTimeISO.value = api.getSimDate().toISOString()
    timeScale.value = api.state.timeScale
    liveSatCount.value = api.satellites.liveCount()
    hudFrame = requestAnimationFrame(tick)
  }
  hudFrame = requestAnimationFrame(tick)

  // Push initial layers state.
  api.satellites.setVisible(layers.value.satellites)
  api.iss.setVisible(layers.value.iss)
  api.smallBodies.setVisible(layers.value.asteroids)
  api.neos.setVisible(layers.value.neos)
  api.hurricanes.setVisible(layers.value.hurricanes)
  api.earthquakes.setVisible(layers.value.earthquakes)
  api.earth.setCloudsEnabled(layers.value.clouds)
  api.earth.atmosphereMesh.visible = layers.value.atmosphere
  api.stars.visible = layers.value.stars
  api.moon.setVisible(layers.value.moon)
  api.sun.setVisible(layers.value.sun)
  api.planets.setVisible(layers.value.planets)
  api.smallBodies.setOrbitsVisible(layers.value.asteroidOrbits)
  api.smallBodies.setTailsVisible(layers.value.cometTails)
  api.userMarker.setVisible(layers.value.userMarker)

  // Catch up: if any feed resolved before the scene was ready, the watcher's
  // `sceneApi.value` guard short-circuited and the layer never got the data.
  // Pump current values now so cold-start with a hot HTTP cache renders
  // populated layers from frame 1.
  if (data.tle.data.value) {
    api.satellites.setEntries(data.tle.data.value)
    api.iss.setTleEntries(data.tle.data.value)
  }
  if (data.sbdb.data.value) api.smallBodies.setBodies(data.sbdb.data.value)
  if (data.neos.data.value) api.neos.setNeos(data.neos.data.value.objects)
  if (data.hurricanes.data.value) api.hurricanes.setStorms(data.hurricanes.data.value)
  if (data.quakes.data.value) api.earthquakes.setQuakes(data.quakes.data.value)
  // Push existing geolocation if we have a fix already.
  if (geo.location.value) {
    api.userMarker.setLocation(geo.location.value.lat, geo.location.value.lon)
  }
}

onBeforeUnmount(() => {
  if (hudFrame) cancelAnimationFrame(hudFrame)
})

function onPick(hit: PickHit | null) {
  if (!hit) {
    selection.value = null
    return
  }
  // Build the new selection up-front; if the lookup fails (data not yet loaded
  // for the picked id) we replace with null instead of leaving the previous
  // selection sticky on screen.
  let next: Selection = null
  if (hit.kind === 'iss') {
    const issState = sceneApi.value?.iss.getState()
    if (issState) next = { kind: 'iss', data: issState }
  } else if (hit.kind === 'asteroid') {
    const sb = data.sbdb.data.value?.find((b) => b.spkid === hit.spkid)
    if (sb) next = { kind: 'asteroid', data: sb }
  } else if (hit.kind === 'neo') {
    const neo = data.neos.data.value?.objects.find((n) => n.id === hit.id)
    if (neo) next = { kind: 'neo', data: neo }
  } else if (hit.kind === 'hurricane') {
    const h = data.hurricanes.data.value?.find((s) => s.id === hit.id)
    if (h) next = { kind: 'hurricane', data: h }
  } else if (hit.kind === 'earthquake') {
    const q = data.quakes.data.value?.find((qq) => qq.id === hit.id)
    if (q) next = { kind: 'earthquake', data: q }
  } else if (hit.kind === 'moon') {
    next = { kind: 'moon' }
  } else if (hit.kind === 'sun') {
    next = { kind: 'sun' }
  } else if (hit.kind === 'planet') {
    next = { kind: 'planet', name: hit.name }
  } else if (hit.kind === 'satellite') {
    const rec = sceneApi.value?.satellites.recordAt(hit.index)
    if (rec) next = { kind: 'satellite', data: rec }
  }
  selection.value = next
  // Always focus on the picked position when we have one, regardless of
  // whether the data lookup succeeded — the click should feel acknowledged.
  // The picker itself already verified the position exists (it's how it found
  // the hit), so positionOf will return non-null below.
  // Camera focus is reserved for surface phenomena (hurricanes, earthquakes)
  // where dropping the camera close to a lat/lon point genuinely helps the
  // user see the highlighted spot. For everything else — orbital objects
  // (ISS, satellites, asteroids, NEOs) or cosmic bodies (Moon, Sun, planets)
  // — the click just opens the InfoPanel; the user navigates manually with
  // drag/scroll. Auto-moving the camera in those cases produced an awkward
  // "fly past, return to Earth view" feeling and conflicted with OrbitControls'
  // internal state.
  if (sceneApi.value && (hit.kind === 'hurricane' || hit.kind === 'earthquake')) {
    let pos: THREE.Vector3 | null = null
    if (hit.kind === 'hurricane') pos = sceneApi.value.hurricanes.positionOf(hit.id)
    else if (hit.kind === 'earthquake') pos = sceneApi.value.earthquakes.positionOf(hit.id)
    if (pos) sceneApi.value.focus(pos)
  }
}

// Push live data into the scene whenever the feed updates.
watch(
  () => data.tle.data.value,
  (entries) => {
    if (entries && sceneApi.value) {
      sceneApi.value.satellites.setEntries(entries)
      // Same TLE list feeds the ISS layer; it filters NORAD 25544 internally.
      sceneApi.value.iss.setTleEntries(entries)
    }
  },
)
watch(
  () => data.sbdb.data.value,
  (list) => { if (list && sceneApi.value) sceneApi.value.smallBodies.setBodies(list) },
)
watch(
  () => data.neos.data.value,
  (feed) => { if (feed && sceneApi.value) sceneApi.value.neos.setNeos(feed.objects) },
)
watch(
  () => data.hurricanes.data.value,
  (list) => { if (list && sceneApi.value) sceneApi.value.hurricanes.setStorms(list) },
)
watch(
  () => data.quakes.data.value,
  (list) => { if (list && sceneApi.value) sceneApi.value.earthquakes.setQuakes(list) },
)
watch(
  () => geo.location.value,
  (loc) => {
    if (sceneApi.value) {
      if (loc) sceneApi.value.userMarker.setLocation(loc.lat, loc.lon)
      else sceneApi.value.userMarker.clearLocation()
    }
  },
)

function togglePause() {
  if (!sceneApi.value) return
  sceneApi.value.setTimeScale(sceneApi.value.state.timeScale === 0 ? 1 : 0)
}
const isPaused = computed(() => timeScale.value === 0)

// ISS pass prediction. Recomputed every minute (passes don't change much over
// short horizons) AND whenever the user's geolocation or the TLE feed change.
const nextPass = ref<PassPrediction | null>(null)
const issEta = ref<string | null>(null)
let passRefreshHandle = 0

function findIssTle(entries: TleEntry[] | null): TleEntry | null {
  return entries?.find((e) => e.noradId === 25544) ?? null
}

function refreshNextPass() {
  const loc = geo.location.value
  const tle = findIssTle(data.tle.data.value ?? null)
  if (!loc || !tle) {
    nextPass.value = null
    return
  }
  try {
    const satrec = satellite.twoline2satrec(tle.line1, tle.line2)
    if (satrec.error) return
    nextPass.value = findNextPass(satrec, loc.lat, loc.lon)
  } catch {
    nextPass.value = null
  }
}

watch([() => geo.location.value, () => data.tle.data.value], refreshNextPass, { immediate: true })

// Drive the eta countdown from a 1 s ticker so the displayed time updates.
if (import.meta.client) {
  const id = window.setInterval(() => {
    const p = nextPass.value
    if (!p) {
      issEta.value = null
      return
    }
    const ms = p.riseAt.getTime() - Date.now()
    if (ms <= 0) {
      // Pass is in progress or past; recompute
      refreshNextPass()
      return
    }
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    issEta.value = h > 0
      ? `${h}h ${m}m ${s.toString().padStart(2, '0')}s`
      : `${m}m ${s.toString().padStart(2, '0')}s`
  }, 1000)
  passRefreshHandle = id
}

onBeforeUnmount(() => {
  if (passRefreshHandle) clearInterval(passRefreshHandle)
})

function onUseLocation() { geo.request() }
function onClearLocation() {
  geo.clear()
  layers.value = { ...layers.value, userMarker: false }
}
// Show the user marker automatically once we have a fix.
watch(() => geo.location.value, (loc) => {
  if (loc) layers.value = { ...layers.value, userMarker: true }
})
</script>

<template>
  <div class="root">
    <EarthViewport :layers="layers" @ready="onReady" @pick="onPick" />
    <LayerToggles :value="layers" @update="(l) => (layers = l)" />
    <InfoPanel :selection="selection" @close="selection = null" />
    <TimeControls
      :sim-time-i-s-o="simTimeISO"
      :paused="isPaused"
      @toggle-pause="togglePause"
    />
    <StatsBar v-bind="stats" />
    <HereControl
      :has-location="!!geo.location.value"
      :geo-error="geo.error.value"
      :iss-eta="issEta"
      :iss-max-el="nextPass?.maxElevationDeg ?? null"
      @request="onUseLocation"
      @clear="onClearLocation"
    />
    <LoadingIndicator :visible="isLoading" />
  </div>
</template>

<style scoped>
.root {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
