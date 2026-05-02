<script setup lang="ts">
const props = defineProps<{
  hasLocation: boolean
  geoError: string | null
  /** Minutes-and-seconds string until next ISS pass, or null when unknown. */
  issEta: string | null
  /** Max elevation degrees of the next pass (informational). */
  issMaxEl: number | null
}>()
const emit = defineEmits<{
  request: []
  clear: []
}>()
</script>

<template>
  <div class="here panel mono">
    <div v-if="!props.hasLocation">
      <button @click="emit('request')">📍 Use my location</button>
      <div v-if="props.geoError" class="dim error">{{ props.geoError }}</div>
    </div>
    <div v-else>
      <div class="row">
        <span class="dim">YOUR LOCATION</span>
        <button class="clear" @click="emit('clear')">✕</button>
      </div>
      <div v-if="props.issEta" class="row iss">
        <span class="dim">ISS overhead in</span>
        <span class="eta">{{ props.issEta }}</span>
      </div>
      <div v-if="props.issMaxEl != null" class="row">
        <span class="dim">Max elevation</span>
        <span>{{ props.issMaxEl.toFixed(0) }}°</span>
      </div>
      <div v-if="!props.issEta" class="dim">No ISS pass within 6 h</div>
    </div>
  </div>
</template>

<style scoped>
.here {
  position: absolute;
  bottom: 70px;
  left: 16px;
  font-size: 11px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 200px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
.row .dim { letter-spacing: 0.06em; }
.eta {
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.clear {
  width: 22px;
  height: 22px;
  padding: 0;
  font-size: 11px;
  line-height: 1;
}
.error { color: var(--accent-warn); margin-top: 4px; }
.iss { padding-top: 4px; border-top: 1px solid var(--panel-border); margin-top: 4px; }
</style>
