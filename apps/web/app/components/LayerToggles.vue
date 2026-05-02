<script setup lang="ts">
export interface LayersState {
  satellites: boolean
  iss: boolean
  asteroids: boolean
  asteroidOrbits: boolean
  cometTails: boolean
  neos: boolean
  hurricanes: boolean
  earthquakes: boolean
  clouds: boolean
  atmosphere: boolean
  stars: boolean
  moon: boolean
  sun: boolean
  planets: boolean
  userMarker: boolean
}

const props = defineProps<{ value: LayersState }>()
const emit = defineEmits<{ update: [layers: LayersState] }>()

function toggle(key: keyof LayersState) {
  emit('update', { ...props.value, [key]: !props.value[key] })
}

const ITEMS: { key: keyof LayersState; label: string; hint: string; color: string }[] = [
  { key: 'clouds', label: 'Clouds', hint: 'Cloud cover layer', color: '#cfd8dc' },
  { key: 'atmosphere', label: 'Atmosphere', hint: 'Sky glow', color: '#7ab8ff' },
  { key: 'stars', label: 'Stars', hint: 'Background sky', color: '#aaaaff' },
  { key: 'sun', label: 'Sun', hint: 'Sun marker (compressed dist.)', color: '#ffe066' },
  { key: 'moon', label: 'Moon', hint: 'True scale', color: '#cccccc' },
  { key: 'planets', label: 'Planets', hint: 'Mercury–Saturn', color: '#d9b87b' },
  { key: 'satellites', label: 'Satellites', hint: 'Click for info', color: '#ffd87a' },
  { key: 'iss', label: 'ISS', hint: 'SGP4 client-side', color: '#ff5050' },
  { key: 'asteroids', label: 'Asteroids', hint: 'Heliocentric', color: '#b0a08a' },
  { key: 'asteroidOrbits', label: 'Orbit Lines', hint: 'Asteroid/comet ellipses', color: '#9be3ff' },
  { key: 'cometTails', label: 'Comet Tails', hint: 'Anti-sun direction', color: '#9be3ff' },
  { key: 'neos', label: 'NEO Close Flybys', hint: 'Asteroids passing near Earth in next 7 days', color: '#b0c8ff' },
  { key: 'hurricanes', label: 'Hurricanes', hint: 'NHC active', color: '#ff7733' },
  { key: 'earthquakes', label: 'Earthquakes', hint: 'USGS M2.5+', color: '#fff080' },
  { key: 'userMarker', label: 'My Location', hint: 'Geolocation pin', color: '#4dffae' },
]
</script>

<template>
  <div class="layer-toggles panel">
    <div class="title dim mono">LAYERS</div>
    <button
      v-for="it in ITEMS"
      :key="it.key"
      :class="{ active: props.value[it.key] }"
      :title="it.hint"
      @click="toggle(it.key)"
    >
      <span class="dot" :style="{ background: it.color }" />
      {{ it.label }}
    </button>
  </div>
</template>

<style scoped>
.layer-toggles {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 200px;
  z-index: 10;
}
.title { margin-bottom: 6px; letter-spacing: 0.08em; }
button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  font-size: 13px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
</style>
