<script setup lang="ts">
const props = defineProps<{
  simTimeISO: string
  paused: boolean
}>()
const emit = defineEmits<{
  togglePause: []
}>()

function pretty(d: string) {
  const date = new Date(d)
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}
</script>

<template>
  <div class="time-controls panel">
    <button
      class="play-toggle"
      :class="{ paused: props.paused }"
      :title="props.paused ? 'Resume real-time' : 'Pause'"
      @click="emit('togglePause')"
    >
      <span v-if="props.paused">▶</span>
      <span v-else>⏸</span>
    </button>
    <div class="time-display">
      <span class="dim mono">REAL TIME</span>
      <span class="mono clock">{{ pretty(props.simTimeISO) }}</span>
    </div>
  </div>
</template>

<style scoped>
.time-controls {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  z-index: 10;
}
.play-toggle {
  width: 32px;
  height: 32px;
  padding: 0;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.play-toggle.paused {
  border-color: var(--accent-warn);
  color: var(--accent-warn);
}
.time-display {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.1;
}
.clock {
  font-size: 13px;
  letter-spacing: 0.02em;
}
</style>
