<script setup lang="ts">
import { ref, shallowRef, onMounted, watch } from 'vue';
import { Monitor, AppWindow, Crop, RefreshCw, Check, X } from 'lucide-vue-next';
import type { CaptureSourceMode, DisplaySourceInfo, WindowSourceInfo } from '@/types/studio';
import { fetchCaptureSources } from '@/lib/tauriBridge';
import { useStudioState } from '@/composables/useStudioState';

const props = defineProps<{
  isOpen: boolean;
  initialTab?: CaptureSourceMode;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'openAreaPicker'): void;
}>();

const {
  captureSourceMode,
  selectedDisplayId,
  selectedWindowId,
  selectedWindowTitle,
  captureArea,
} = useStudioState();

const activeTab = shallowRef<CaptureSourceMode>(props.initialTab || captureSourceMode.value);
const displays = ref<DisplaySourceInfo[]>([]);
const windows = ref<WindowSourceInfo[]>([]);
const isLoading = shallowRef(false);

async function loadSources() {
  isLoading.value = true;
  try {
    const res = await fetchCaptureSources();
    displays.value = res.displays;
    windows.value = res.windows;
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      activeTab.value = props.initialTab || captureSourceMode.value;
      loadSources();
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (props.isOpen) {
    loadSources();
  }
});

function selectDisplay(d: DisplaySourceInfo) {
  captureSourceMode.value = 'display';
  selectedDisplayId.value = d.id;
  selectedWindowId.value = '';
  selectedWindowTitle.value = d.name;
  captureArea.value = { x: d.x, y: d.y, width: d.width, height: d.height };
  emit('close');
}

function selectWindow(w: WindowSourceInfo) {
  captureSourceMode.value = 'window';
  selectedWindowId.value = w.id;
  selectedWindowTitle.value = w.title;
  captureArea.value = { x: w.x, y: w.y, width: w.width, height: w.height };
  emit('close');
}

function handleLaunchAreaPicker() {
  captureSourceMode.value = 'area';
  selectedWindowTitle.value = `Region (${captureArea.value.width}×${captureArea.value.height})`;
  emit('close');
  emit('openAreaPicker');
}
</script>

<template>
  <div
    v-if="props.isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md font-sans select-none"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-xl rounded-3xl bg-[#0e111a] border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-white">Select Capture Source</h3>
          <p class="text-xs text-white/50">Choose an entire display, a specific window, or a custom region</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="loadSources"
            class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
            title="Refresh Displays & Windows"
          >
            <RefreshCw class="w-4 h-4" :class="isLoading ? 'animate-spin' : ''" />
          </button>
          <button
            @click="emit('close')"
            class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Mode Tabs -->
      <div class="px-6 pt-4 flex items-center gap-2">
        <button
          @click="activeTab = 'display'"
          :class="[
            'flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition',
            activeTab === 'display'
              ? 'bg-rose-500/20 border-rose-500/50 text-white'
              : 'bg-white/5 border-white/5 text-white/60 hover:text-white'
          ]"
        >
          <Monitor class="w-4 h-4 text-rose-400" />
          <span>Displays ({{ displays.length }})</span>
        </button>

        <button
          @click="activeTab = 'window'"
          :class="[
            'flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition',
            activeTab === 'window'
              ? 'bg-indigo-500/20 border-indigo-500/50 text-white'
              : 'bg-white/5 border-white/5 text-white/60 hover:text-white'
          ]"
        >
          <AppWindow class="w-4 h-4 text-indigo-400" />
          <span>Windows ({{ windows.length }})</span>
        </button>

        <button
          @click="activeTab = 'area'"
          :class="[
            'flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition',
            activeTab === 'area'
              ? 'bg-emerald-500/20 border-emerald-500/50 text-white'
              : 'bg-white/5 border-white/5 text-white/60 hover:text-white'
          ]"
        >
          <Crop class="w-4 h-4 text-emerald-400" />
          <span>Custom Area</span>
        </button>
      </div>

      <!-- Body -->
      <div class="p-6 overflow-y-auto space-y-2.5 flex-1">
        <!-- Displays List -->
        <template v-if="activeTab === 'display'">
          <div
            v-for="d in displays"
            :key="d.id"
            @click="selectDisplay(d)"
            :class="[
              'p-4 rounded-2xl border cursor-pointer flex items-center justify-between transition',
              captureSourceMode === 'display' && selectedDisplayId === d.id
                ? 'bg-rose-500/15 border-rose-500/50 text-white'
                : 'bg-white/5 border-white/10 hover:border-white/25 text-white/80'
            ]"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Monitor class="w-5 h-5" />
              </div>
              <div>
                <div class="text-xs font-bold text-white flex items-center gap-2">
                  <span>{{ d.name }}</span>
                  <span v-if="d.isPrimary" class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                    PRIMARY
                  </span>
                </div>
                <div class="text-[11px] font-mono text-white/50 mt-0.5">
                  Resolution: {{ d.width }} × {{ d.height }} • Offset: +{{ d.x }}+{{ d.y }}
                </div>
              </div>
            </div>
            <Check
              v-if="captureSourceMode === 'display' && selectedDisplayId === d.id"
              class="w-4 h-4 text-rose-400"
            />
          </div>
        </template>

        <!-- Windows List -->
        <template v-else-if="activeTab === 'window'">
          <div
            v-for="w in windows"
            :key="w.id"
            @click="selectWindow(w)"
            :class="[
              'p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition',
              captureSourceMode === 'window' && selectedWindowId === w.id
                ? 'bg-indigo-500/15 border-indigo-500/50 text-white'
                : 'bg-white/5 border-white/10 hover:border-white/25 text-white/80'
            ]"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                <AppWindow class="w-4 h-4" />
              </div>
              <div class="min-w-0">
                <div class="text-xs font-semibold text-white truncate max-w-md">
                  {{ w.title }}
                </div>
                <div class="text-[11px] font-mono text-white/50">
                  {{ w.appName }} • {{ w.width }} × {{ w.height }} at ({{ w.x }}, {{ w.y }})
                </div>
              </div>
            </div>
            <Check
              v-if="captureSourceMode === 'window' && selectedWindowId === w.id"
              class="w-4 h-4 text-indigo-400 shrink-0"
            />
          </div>
        </template>

        <!-- Custom Area Configuration -->
        <template v-else>
          <div class="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label class="block text-[10px] font-mono uppercase text-white/50 mb-1">X Offset</label>
                <input
                  v-model.number="captureArea.x"
                  type="number"
                  min="0"
                  class="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label class="block text-[10px] font-mono uppercase text-white/50 mb-1">Y Offset</label>
                <input
                  v-model.number="captureArea.y"
                  type="number"
                  min="0"
                  class="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label class="block text-[10px] font-mono uppercase text-white/50 mb-1">Width (px)</label>
                <input
                  v-model.number="captureArea.width"
                  type="number"
                  min="120"
                  step="2"
                  class="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label class="block text-[10px] font-mono uppercase text-white/50 mb-1">Height (px)</label>
                <input
                  v-model.number="captureArea.height"
                  type="number"
                  min="120"
                  step="2"
                  class="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white"
                />
              </div>
            </div>

            <div class="flex items-center justify-between pt-2">
              <button
                @click="handleLaunchAreaPicker"
                class="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-2 transition shadow-lg"
              >
                <Crop class="w-4 h-4" />
                <span>Draw Region on Screen</span>
              </button>

              <button
                @click="captureSourceMode = 'area'; selectedWindowTitle = `Region (${captureArea.width}×${captureArea.height})`; emit('close')"
                class="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
              >
                Save Coordinates
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
