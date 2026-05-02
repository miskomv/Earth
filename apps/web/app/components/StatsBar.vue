<script setup lang="ts">
defineProps<{
  satellites: number
  asteroids: number
  neos: number
  hurricanes: number
  earthquakes: number
}>()
</script>

<template>
  <div class="stats-bar panel mono">
    <div><span class="dim">SAT</span> {{ satellites }}</div>
    <div><span class="dim">SBO</span> {{ asteroids }}</div>
    <div><span class="dim">NEO</span> {{ neos }}</div>
    <div><span class="dim">HUR</span> {{ hurricanes }}</div>
    <div><span class="dim">EQK</span> {{ earthquakes }}</div>
  </div>
</template>

<style scoped>
.stats-bar {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  gap: 14px;
  font-size: 11px;
  z-index: 10;
}
.stats-bar .dim { letter-spacing: 0.08em; margin-right: 4px; }
</style>
