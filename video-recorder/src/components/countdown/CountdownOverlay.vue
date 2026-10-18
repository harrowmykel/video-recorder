<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { playCountdownTone } from '@/lib/audioTone';
import { useTheme } from '@/composables/useTheme';

const emit = defineEmits<{
  (e: 'complete'): void;
  (e: 'cancel'): void;
}>();

const { currentTheme, initTheme } = useTheme();

const count = ref<number | 'ACTION'>(3);
let timeouts: ReturnType<typeof setTimeout>[] = [];

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('cancel');
  }
}

onMounted(() => {
  initTheme();
  window.addEventListener('keydown', handleKeydown);

  playCountdownTone('tick');

  timeouts.push(
    setTimeout(() => {
      count.value = 2;
      playCountdownTone('tick');
    }, 1000)
  );

  timeouts.push(
    setTimeout(() => {
      count.value = 1;
      playCountdownTone('tick');
    }, 2000)
  );

  timeouts.push(
    setTimeout(() => {
      count.value = 'ACTION';
      playCountdownTone('go');
    }, 3000)
  );

  timeouts.push(
    setTimeout(() => {
      emit('complete');
    }, 3700)
  );
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  timeouts.forEach(clearTimeout);
});
</script>

<template>
  <div
    @click="emit('cancel')"
    class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md cursor-pointer select-none"
  >
    <!-- Spatial Theme Layout (VisionOS Radial Progress Glass) -->
    <template v-if="currentTheme === 'spatial'">
      <div class="relative w-52 h-52 rounded-full spatial-glass flex flex-col items-center justify-center shadow-2xl">
        <svg class="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="3" />
          <circle
            cx="60" cy="60" r="54" fill="none" stroke="#38bdf8" stroke-width="4"
            stroke-dasharray="339.29"
            :stroke-dashoffset="count === 3 ? 113 : count === 2 ? 226 : 339"
            stroke-linecap="round"
            class="transition-all duration-700"
          />
        </svg>
        <span class="text-7xl font-extrabold text-white tracking-tighter drop-shadow-lg">
          {{ count }}
        </span>
        <span class="text-[11px] font-semibold uppercase tracking-widest text-sky-300 mt-1">Get Ready</span>
      </div>
    </template>

    <!-- Graphite Theme Layout (SMPTE Broadcast Crosshair Leader) -->
    <template v-else-if="currentTheme === 'graphite'">
      <div class="relative w-52 h-52 rounded-lg recessed-screen border-2 border-zinc-700 flex flex-col items-center justify-center font-mono">
        <div class="absolute inset-x-0 top-1/2 h-px bg-zinc-800"></div>
        <div class="absolute inset-y-0 left-1/2 w-px bg-zinc-800"></div>
        <span class="relative z-10 text-7xl font-bold text-white tabular-nums tracking-widest drop-shadow">
          {{ typeof count === 'number' ? `0${count}` : count }}
        </span>
        <span class="relative z-10 text-[10px] uppercase tracking-widest text-[#ff5500] mt-1 font-bold">PRE-ROLLSYNC</span>
      </div>
    </template>

    <!-- Nordic Theme Layout (Ceramic Card Medallion) -->
    <template v-else-if="currentTheme === 'nordic'">
      <div class="w-48 h-48 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col items-center justify-center">
        <span class="text-7xl font-extrabold text-slate-900 dark:text-white tabular-nums">
          {{ count }}
        </span>
        <span class="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mt-1">Starting Capture</span>
      </div>
    </template>

    <!-- Obsidian Theme Layout (Raycast / Precision Disc) -->
    <template v-else>
      <div class="relative w-52 h-52 rounded-full obsidian-panel flex flex-col items-center justify-center shadow-2xl border-white/15">
        <span class="text-8xl font-black font-mono text-white tracking-tight drop-shadow-[0_10px_30px_rgba(244,63,94,0.35)]">
          {{ count }}
        </span>
        <span class="text-xs font-mono uppercase tracking-widest text-rose-400 mt-1 font-bold">PRE-RECORD</span>
      </div>
    </template>

    <p class="mt-8 text-xs font-mono tracking-widest text-white/50 uppercase">
      Click anywhere or press Esc to cancel
    </p>
  </div>
</template>
