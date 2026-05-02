<script setup lang="ts">
import type {
  ActiveHurricane,
  Earthquake,
  IssState,
  NearEarthObject,
  SmallBody,
} from '@universe/shared'
import type { SatelliteRecord } from '../three/objects/satellites.js'

export type Selection =
  | { kind: 'iss'; data: IssState }
  | { kind: 'asteroid'; data: SmallBody }
  | { kind: 'neo'; data: NearEarthObject }
  | { kind: 'hurricane'; data: ActiveHurricane }
  | { kind: 'earthquake'; data: Earthquake }
  | { kind: 'moon' }
  | { kind: 'sun' }
  | { kind: 'planet'; name: string }
  | { kind: 'satellite'; data: SatelliteRecord }
  | null

const props = defineProps<{ selection: Selection }>()
const emit = defineEmits<{ close: [] }>()

function fmtKm(km: number) {
  return km >= 1000 ? `${(km / 1000).toFixed(1)} × 10³ km` : `${km.toFixed(1)} km`
}
function fmtDistance(km: number) {
  if (km > 1.5e8) return `${(km / 1.495978707e8).toFixed(3)} AU`
  if (km > 1000) return `${(km / 1000).toFixed(0)} × 10³ km`
  return `${km.toFixed(0)} km`
}
</script>

<template>
  <Transition name="slide">
    <div v-if="props.selection" class="info-panel panel">
      <button class="close" @click="emit('close')">×</button>
      <template v-if="props.selection.kind === 'iss'">
        <div class="title">International Space Station</div>
        <div class="grid mono">
          <div class="dim">Latitude</div><div>{{ props.selection.data.position.lat.toFixed(3) }}°</div>
          <div class="dim">Longitude</div><div>{{ props.selection.data.position.lon.toFixed(3) }}°</div>
          <div class="dim">Altitude</div><div>{{ fmtKm(props.selection.data.position.altKm ?? 0) }}</div>
          <div class="dim">Velocity</div><div>{{ props.selection.data.velocityKmS.toFixed(2) }} km/s</div>
          <div class="dim">Visibility</div><div>{{ props.selection.data.visibility }}</div>
          <div class="dim">Footprint</div><div>{{ fmtKm(props.selection.data.footprintKm) }}</div>
          <div class="dim">Updated</div><div>{{ new Date(props.selection.data.timestamp).toLocaleTimeString() }}</div>
        </div>
      </template>
      <template v-else-if="props.selection.kind === 'asteroid'">
        <div class="title">{{ props.selection.data.fullname }}</div>
        <div class="dim">{{ props.selection.data.kind === 'comet' ? 'Comet' : 'Asteroid' }} {{ props.selection.data.orbitClass ? `· ${props.selection.data.orbitClass}` : '' }}</div>
        <div class="grid mono">
          <div class="dim">SPK ID</div><div>{{ props.selection.data.spkid }}</div>
          <div v-if="props.selection.data.diameterKm" class="dim">Diameter</div>
          <div v-if="props.selection.data.diameterKm">{{ props.selection.data.diameterKm.toFixed(2) }} km</div>
          <div class="dim">a</div><div>{{ props.selection.data.elements.a.toFixed(4) }} AU</div>
          <div class="dim">e</div><div>{{ props.selection.data.elements.e.toFixed(4) }}</div>
          <div class="dim">i</div><div>{{ props.selection.data.elements.i.toFixed(2) }}°</div>
          <div class="dim">PHA</div><div>{{ props.selection.data.isPha ? 'yes' : 'no' }}</div>
          <div class="dim">NEO</div><div>{{ props.selection.data.isNeo ? 'yes' : 'no' }}</div>
        </div>
      </template>
      <template v-else-if="props.selection.kind === 'neo'">
        <div class="title">{{ props.selection.data.name }}</div>
        <div class="dim">Near-Earth Object · close approach</div>
        <div class="grid mono">
          <div class="dim">Date</div><div>{{ new Date(props.selection.data.closeApproach.date).toUTCString() }}</div>
          <div class="dim">Miss distance</div><div>{{ fmtDistance(props.selection.data.closeApproach.missDistanceKm) }}</div>
          <div class="dim">Lunar dist.</div><div>{{ props.selection.data.closeApproach.missDistanceLunar.toFixed(2) }} LD</div>
          <div class="dim">Velocity</div><div>{{ props.selection.data.closeApproach.relativeVelocityKmS.toFixed(2) }} km/s</div>
          <div class="dim">Diameter</div><div>{{ props.selection.data.estimatedDiameterMetersMin.toFixed(0) }}–{{ props.selection.data.estimatedDiameterMetersMax.toFixed(0) }} m</div>
          <div class="dim">Hazardous</div><div>{{ props.selection.data.isPotentiallyHazardous ? 'YES' : 'no' }}</div>
        </div>
        <a :href="props.selection.data.nasaJplUrl" target="_blank" rel="noopener">JPL details ↗</a>
      </template>
      <template v-else-if="props.selection.kind === 'hurricane'">
        <div class="title">{{ props.selection.data.name }} <span class="dim">{{ props.selection.data.id }}</span></div>
        <div class="dim">{{ props.selection.data.category }} · {{ props.selection.data.basin }} basin · {{ props.selection.data.source }}</div>
        <div class="grid mono">
          <div class="dim">Position</div><div>{{ props.selection.data.position.lat.toFixed(2) }}°, {{ props.selection.data.position.lon.toFixed(2) }}°</div>
          <div class="dim">Wind</div><div>{{ props.selection.data.windKt }} kt</div>
          <div v-if="props.selection.data.pressureMb" class="dim">Pressure</div>
          <div v-if="props.selection.data.pressureMb">{{ props.selection.data.pressureMb }} mb</div>
          <div v-if="props.selection.data.movementKt != null" class="dim">Movement</div>
          <div v-if="props.selection.data.movementKt != null">{{ props.selection.data.movementKt }} kt @ {{ props.selection.data.movementDeg }}°</div>
          <div class="dim">Advisory</div><div>{{ new Date(props.selection.data.advisoryAt).toUTCString() }}</div>
        </div>
      </template>
      <template v-else-if="props.selection.kind === 'earthquake'">
        <div class="title">M{{ props.selection.data.magnitude.toFixed(1) }} · {{ props.selection.data.place }}</div>
        <div class="grid mono">
          <div class="dim">Time</div><div>{{ new Date(props.selection.data.time).toUTCString() }}</div>
          <div class="dim">Depth</div><div>{{ props.selection.data.depthKm.toFixed(1) }} km</div>
          <div class="dim">Position</div><div>{{ props.selection.data.position.lat.toFixed(3) }}°, {{ props.selection.data.position.lon.toFixed(3) }}°</div>
          <div class="dim">Tsunami</div><div>{{ props.selection.data.tsunami ? 'yes' : 'no' }}</div>
          <div v-if="props.selection.data.alert" class="dim">Alert</div>
          <div v-if="props.selection.data.alert">{{ props.selection.data.alert.toUpperCase() }}</div>
        </div>
        <a :href="props.selection.data.url" target="_blank" rel="noopener">USGS event ↗</a>
      </template>
      <template v-else-if="props.selection.kind === 'moon'">
        <div class="title">Moon</div>
        <div class="dim">Earth's natural satellite</div>
        <div class="grid mono">
          <div class="dim">Mean radius</div><div>1,737.4 km</div>
          <div class="dim">Mean distance</div><div>384,400 km</div>
          <div class="dim">Orbital period</div><div>27.32 days</div>
          <div class="dim">Tidally locked</div><div>yes</div>
          <div class="dim">Position</div><div>computed via astronomy-engine ELP2000</div>
        </div>
      </template>
      <template v-else-if="props.selection.kind === 'sun'">
        <div class="title">Sun</div>
        <div class="dim">G-type main-sequence star (G2V)</div>
        <div class="grid mono">
          <div class="dim">Mean radius</div><div>695,700 km</div>
          <div class="dim">Mean distance</div><div>1 AU = 149.6 M km</div>
          <div class="dim">Surface temp</div><div>~5,778 K</div>
          <div class="dim">Render dist.</div><div>log-compressed (≠ true scale)</div>
        </div>
      </template>
      <template v-else-if="props.selection.kind === 'planet'">
        <div class="title">{{ props.selection.name }}</div>
        <div class="dim">Solar system planet · log-compressed distance</div>
        <div class="grid mono">
          <div class="dim">Position</div><div>computed via astronomy-engine VSOP87</div>
          <div class="dim">Source</div><div>geocentric, J2000 mean equator</div>
        </div>
      </template>
      <template v-else-if="props.selection.kind === 'satellite'">
        <div class="title">{{ props.selection.data.entry.name }}</div>
        <div class="dim">NORAD {{ props.selection.data.entry.noradId }} · {{ props.selection.data.entry.group }}</div>
        <div class="grid mono">
          <div class="dim">Latitude</div><div>{{ props.selection.data.position.lat.toFixed(3) }}°</div>
          <div class="dim">Longitude</div><div>{{ props.selection.data.position.lon.toFixed(3) }}°</div>
          <div class="dim">Altitude</div><div>{{ props.selection.data.altKm.toFixed(1) }} km</div>
          <div class="dim">Speed</div><div>{{ props.selection.data.velocityKmS.toFixed(2) }} km/s</div>
        </div>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
.info-panel {
  position: absolute;
  top: 16px;
  left: 16px;
  width: 320px;
  max-height: calc(100vh - 32px);
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}
.title { font-size: 16px; font-weight: 600; }
.grid {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 4px 12px;
  font-size: 12px;
}
.close {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
}
.slide-enter-active, .slide-leave-active { transition: all 0.2s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(-12px); opacity: 0; }
</style>
