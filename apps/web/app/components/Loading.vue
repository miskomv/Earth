<script setup lang="ts">
defineProps<{ visible: boolean }>()
</script>

<template>
  <Transition name="fade">
    <div v-if="visible" class="loading">
      <div class="ring"></div>
      <div class="text mono">Loading orbital data…</div>
    </div>
  </Transition>
</template>

<style scoped>
.loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: radial-gradient(circle at center, rgba(0,8,20,0.6) 0%, rgba(0,0,8,0.95) 70%);
  z-index: 100;
  pointer-events: none;
}
.ring {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid rgba(120, 170, 220, 0.18);
  border-top-color: var(--accent);
  animation: spin 1s linear infinite;
}
.text { letter-spacing: 0.08em; color: var(--fg-dim); }
@keyframes spin { to { transform: rotate(360deg); } }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
