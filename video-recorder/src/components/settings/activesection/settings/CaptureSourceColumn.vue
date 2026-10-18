<script setup lang="ts">
import { ref, shallowRef, onMounted } from 'vue';
import {
  Monitor,
  AppWindow,
  Crop,
  Check,
  RefreshCw,
} from 'lucide-vue-next';
import { useStudioState } from '@/composables/useStudioState';
import { fetchCaptureSources } from '@/lib/tauriBridge';
import type { DisplaySourceInfo, WindowSourceInfo } from '@/types/studio';

const emit = defineEmits<{
  (e: 'openAreaPicker'): void;
}>();

const {
  captureSourceMode,
  selectedDisplayId,
  selectedWindowId,
  selectedWindowTitle,
  captureArea,
  targetFps,
} = useStudioState();

const displays = ref<DisplaySourceInfo[]>([]);
const windows = ref<WindowSourceInfo[]>([]);
const isLoadingSources = shallowRef(false);

async function loadSources() {
  isLoadingSources.value = true;
  try {
    const res = await fetchCaptureSources();
    displays.value = res.displays;
    windows.value = res.windows;
  } finally {
    isLoadingSources.value = false;
  }
}

onMounted(() => {
  loadSources();
});
</script>

<template>
  <div class="p-5 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-xl space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div
          class="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
          <Monitor class="w-4 h-4" />
        </div>
        <div>
          <h3 class="text-sm font-bold text-white">1. Screen Capture Source</h3>
          <p class="text-[11px] text-white/50">Select Display, Window, or Custom Area</p>
        </div>
      </div>
      <button @click="loadSources"
        class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
        title="Refresh Displays & Windows">
        <RefreshCw class="w-3.5 h-3.5" :class="isLoadingSources ? 'animate-spin' : ''" />
      </button>
    </div>

    <!-- Source Mode Switcher -->
    <div class="grid grid-cols-3 gap-2">
      <button @click="captureSourceMode = 'display'" :class="[
        'py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition',
        captureSourceMode === 'display'
          ? 'bg-rose-500 text-white border-rose-400 shadow'
          : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
      ]">
        <Monitor class="w-3.5 h-3.5" />
        <span>Display</span>
      </button>
      <button @click="captureSourceMode = 'window'; loadSources()" :class="[
        'py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition',
        captureSourceMode === 'window'
          ? 'bg-indigo-500 text-white border-indigo-400 shadow'
          : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
      ]">
        <AppWindow class="w-3.5 h-3.5" />
        <span>Window</span>
      </button>
      <button @click="captureSourceMode = 'area'" :class="[
        'py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition',
        captureSourceMode === 'area'
          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow font-bold'
          : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
      ]">
        <Crop class="w-3.5 h-3.5" />
        <span>Area</span>
      </button>
    </div>

    <!-- Displays List -->
    <div v-if="captureSourceMode === 'display'" class="space-y-2">
      <span class="text-[10px] font-mono uppercase text-white/40 block">Available Monitors</span>
      <button v-for="d in displays" :key="d.id"
        @click="selectedDisplayId = d.id; selectedWindowTitle = d.name; captureArea = { x: d.x, y: d.y, width: d.width, height: d.height }"
        :class="[
          'w-full p-3 rounded-2xl text-left border flex items-center justify-between transition',
          selectedDisplayId === d.id
            ? 'bg-rose-500/15 border-rose-400/50 text-white'
            : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
        ]">
        <div>
          <div class="text-xs font-semibold">{{ d.name }}</div>
          <div class="text-[10px] font-mono text-white/50">{{ d.width }} × {{ d.height }} • Offset +{{ d.x }}+{{
            d.y }}</div>
        </div>
        <Check v-if="selectedDisplayId === d.id" class="w-4 h-4 text-rose-400" />
      </button>
    </div>

    <!-- Windows List -->
    <div v-else-if="captureSourceMode === 'window'" class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
      <span class="text-[10px] font-mono uppercase text-white/40 block">Open Desktop Windows ({{ windows.length
        }})</span>
      <button v-for="w in windows" :key="w.id"
        @click="selectedWindowId = w.id; selectedWindowTitle = w.title; captureArea = { x: w.x, y: w.y, width: w.width, height: w.height }"
        :class="[
          'w-full p-2.5 rounded-xl text-left border flex items-center justify-between transition',
          selectedWindowId === w.id
            ? 'bg-indigo-500/20 border-indigo-400/50 text-white'
            : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
        ]">
        <div class="min-w-0 pr-2">
          <div class="text-xs font-semibold truncate">{{ w.title }}</div>
          <div class="text-[10px] font-mono text-white/50">{{ w.appName }} • {{ w.width }}×{{ w.height }}</div>
        </div>
        <Check v-if="selectedWindowId === w.id" class="w-4 h-4 text-indigo-400 shrink-0" />
      </button>
    </div>

    <!-- Area Coordinates & Interactive Picker -->
    <div v-else class="space-y-3">
      <div class="grid grid-cols-2 gap-2.5">
        <div>
          <label class="text-[10px] font-mono text-white/50 uppercase block mb-1">X Offset</label>
          <input v-model.number="captureArea.x" type="number"
            class="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white" />
        </div>
        <div>
          <label class="text-[10px] font-mono text-white/50 uppercase block mb-1">Y Offset</label>
          <input v-model.number="captureArea.y" type="number"
            class="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white" />
        </div>
        <div>
          <label class="text-[10px] font-mono text-white/50 uppercase block mb-1">Width (px)</label>
          <input v-model.number="captureArea.width" type="number" step="2"
            class="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white" />
        </div>
        <div>
          <label class="text-[10px] font-mono text-white/50 uppercase block mb-1">Height (px)</label>
          <input v-model.number="captureArea.height" type="number" step="2"
            class="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white" />
        </div>
      </div>

      <button @click="emit('openAreaPicker')"
        class="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition">
        <Crop class="w-4 h-4" />
        <span>Interactive Screen Region Selector</span>
      </button>
    </div>

    <!-- Frame Rate Setting -->
    <div class="pt-3 border-t border-white/10 flex items-center justify-between">
      <span class="text-xs text-white/70 font-medium">Target Frame Rate</span>
      <div class="flex items-center gap-1.5">
        <button @click="targetFps = 30"
          :class="['px-3 py-1 rounded-lg text-xs font-mono font-bold transition', targetFps === 30 ? 'bg-white text-black' : 'bg-white/5 text-white/60']">
          30 FPS
        </button>
        <button @click="targetFps = 60"
          :class="['px-3 py-1 rounded-lg text-xs font-mono font-bold transition', targetFps === 60 ? 'bg-white text-black' : 'bg-white/5 text-white/60']">
          60 FPS
        </button>
      </div>
    </div>
  </div>
</template>
