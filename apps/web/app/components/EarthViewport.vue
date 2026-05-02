<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import type { LayersState } from './LayerToggles.vue'
import type { SceneApi, PickHit } from '../three/scene.js'

const props = defineProps<{
  layers: LayersState
}>()
const emit = defineEmits<{
  ready: [api: SceneApi]
  pick: [hit: PickHit | null]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let scene: SceneApi | null = null
let resizeObserver: ResizeObserver | null = null
/**
 * Set when the component is unmounting. The dynamic Three.js import is async,
 * so the user can navigate away before `createScene` runs — without this guard
 * we'd construct a WebGL renderer attached to a destroyed canvas and leak it
 * (no surviving handle to call dispose on).
 */
let cancelled = false

onMounted(() => {
  if (!canvasRef.value) return
  // Lazy import keeps Three.js out of SSR.
  import('../three/scene.js').then(({ createScene }) => {
    if (cancelled || !canvasRef.value) return
    scene = createScene(canvasRef.value)
    scene.start()
    emit('ready', scene)
    resizeObserver = new ResizeObserver(() => scene?.resize())
    resizeObserver.observe(canvasRef.value)
    window.addEventListener('resize', onWinResize)
    canvasRef.value.addEventListener('click', onClick)
  })
})

onBeforeUnmount(() => {
  cancelled = true
  if (canvasRef.value) {
    canvasRef.value.removeEventListener('click', onClick)
  }
  resizeObserver?.disconnect()
  window.removeEventListener('resize', onWinResize)
  scene?.dispose()
  scene = null
})

function onWinResize() {
  scene?.resize()
}

function onClick(ev: MouseEvent) {
  if (!scene || !canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
  const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
  const hit = scene.pick({ x, y })
  emit('pick', hit)
}

watch(
  () => props.layers,
  (l) => {
    if (!scene) return
    scene.satellites.setVisible(l.satellites)
    scene.iss.setVisible(l.iss)
    scene.smallBodies.setVisible(l.asteroids)
    scene.smallBodies.setOrbitsVisible(l.asteroidOrbits)
    scene.smallBodies.setTailsVisible(l.cometTails)
    scene.neos.setVisible(l.neos)
    scene.hurricanes.setVisible(l.hurricanes)
    scene.earthquakes.setVisible(l.earthquakes)
    scene.earth.setCloudsEnabled(l.clouds)
    scene.earth.atmosphereMesh.visible = l.atmosphere
    scene.stars.visible = l.stars
    scene.moon.setVisible(l.moon)
    scene.sun.setVisible(l.sun)
    scene.planets.setVisible(l.planets)
    scene.userMarker.setVisible(l.userMarker)
  },
  { deep: true, immediate: false },
)
</script>

<template>
  <canvas ref="canvasRef" class="viewport" />
</template>

<style scoped>
.viewport {
  display: block;
  width: 100vw;
  height: 100vh;
  cursor: grab;
}
.viewport:active { cursor: grabbing; }
</style>
