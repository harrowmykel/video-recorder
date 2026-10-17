<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Play,
  Pause,
  Scissors,
  Download,
  FolderOpen,
  ZoomIn,
  Sparkles,
  Layers,
  Monitor,
  Video,
  X,
  Volume2
} from 'lucide-vue-next';
import DragDropBgRemover from './DragDropBgRemover.vue';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const activeTab = ref<'review' | 'batch_ai'>('review');
const isPlaying = ref(false);
const currentTime = ref(14.2);
const duration = ref(42.0);
const isAutoZoomActive = ref(true);
const isCameraPiPVisible = ref(true);
const selectedExportFormat = ref<'multi_track' | 'composite_zoom' | 'prores'>('multi_track');

const progressPercent = computed(() => {
  return (currentTime.value / duration.value) * 100;
});

function togglePlay() {
  isPlaying.value = !isPlaying.value;
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-md select-none">
    <div class="glass-panel w-full max-w-6xl h-[90vh] rounded-3xl flex flex-col overflow-hidden border border-white/10 shadow-2xl">
      <!-- Top Window Header -->
      <div class="px-6 py-4 flex items-center justify-between border-b border-white/10 bg-studio-dark/60">
        <div class="flex items-center space-x-3">
          <div class="w-3 h-3 rounded-full bg-studio-crimson" />
          <div>
            <h2 class="text-sm font-semibold text-white">Studio Review & Export</h2>
            <p class="text-xs text-gray-400 font-mono">session_20261017_143245 • Clean Screen + Decoupled Camera</p>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex items-center space-x-1 p-1 rounded-xl bg-black/40 border border-white/10">
          <button
            @click="activeTab = 'review'"
            class="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            :class="activeTab === 'review' ? 'bg-white/20 text-white shadow' : 'text-gray-400 hover:text-white'"
          >
            Review & Cut
          </button>
          <button
            @click="activeTab = 'batch_ai'"
            class="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1.5"
            :class="activeTab === 'batch_ai' ? 'bg-studio-indigo text-white shadow-lg shadow-indigo-500/30' : 'text-gray-400 hover:text-white'"
          >
            <Sparkles class="w-3 h-3" />
            <span>AI Background Studio</span>
          </button>
        </div>

        <button
          @click="emit('close')"
          class="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          title="Close Modal"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Main Body Area -->
      <div class="flex-1 overflow-y-auto p-6 bg-studio-bg/60">
        <!-- Tab 1: Review & Cut View -->
        <div v-if="activeTab === 'review'" class="space-y-6">
          <!-- Synchronized Video Viewport -->
          <div class="relative w-full aspect-video max-h-[50vh] rounded-2xl overflow-hidden bg-black/80 border border-white/10 shadow-2xl flex items-center justify-center">
            <!-- Simulated Clean Screen Track -->
            <div
              class="w-full h-full flex flex-col items-center justify-center text-gray-500 transition-all duration-500"
              :class="isAutoZoomActive ? 'scale-110 origin-top-left' : 'scale-100'"
            >
              <Monitor class="w-16 h-16 text-studio-indigo/40 mb-2" />
              <span class="text-sm font-medium text-gray-400">Clean Screen Recording Track</span>
              <span class="text-xs text-gray-600 font-mono mt-1">1920x1080 @ 60 FPS • Excluded Overlays</span>
            </div>

            <!-- Picture-in-Picture Decoupled Camera Track -->
            <div
              v-if="isCameraPiPVisible"
              class="absolute bottom-6 right-6 w-52 aspect-square rounded-full border-2 border-studio-crimson/80 bg-studio-slate/90 shadow-2xl overflow-hidden flex flex-col items-center justify-center text-white"
            >
              <Video class="w-8 h-8 text-indigo-400 mb-1" />
              <span class="text-xs font-medium">Camera Track</span>
              <span class="text-[10px] text-emerald-400 font-mono">Synced isolated raw</span>
            </div>

            <!-- Screen-Studio Auto-Zoom Indicator Badge -->
            <div
              v-if="isAutoZoomActive"
              class="absolute top-4 left-4 px-3 py-1 rounded-full bg-studio-indigo/80 border border-indigo-400/30 text-xs font-medium text-indigo-100 flex items-center space-x-1.5 backdrop-blur-md"
            >
              <ZoomIn class="w-3.5 h-3.5" />
              <span>Screen-Studio Auto-Zoom Preview (Active)</span>
            </div>
          </div>

          <!-- Timeline Scrubber & Trim Handles -->
          <div class="p-4 rounded-2xl glass-card space-y-3">
            <div class="flex items-center justify-between text-xs font-mono text-gray-400">
              <div class="flex items-center space-x-2">
                <span class="text-white font-semibold">{{ formatTime(currentTime) }}</span>
                <span>/</span>
                <span>{{ formatTime(duration) }}</span>
              </div>
              <div class="flex items-center space-x-3">
                <label class="flex items-center space-x-1.5 cursor-pointer text-gray-300 hover:text-white">
                  <input
                    type="checkbox"
                    v-model="isAutoZoomActive"
                    class="rounded accent-studio-indigo"
                  />
                  <span>Simulate Cursor Auto-Zoom</span>
                </label>
                <span>•</span>
                <label class="flex items-center space-x-1.5 cursor-pointer text-gray-300 hover:text-white">
                  <input
                    type="checkbox"
                    v-model="isCameraPiPVisible"
                    class="rounded accent-studio-crimson"
                  />
                  <span>Show Camera PiP</span>
                </label>
              </div>
            </div>

            <!-- Waveform & Scrub Track -->
            <div class="relative w-full h-8 bg-black/50 rounded-lg overflow-hidden flex items-center cursor-pointer px-1">
              <!-- Audio waveform visualization -->
              <div class="absolute inset-0 flex items-center justify-between px-2 opacity-30 pointer-events-none">
                <div v-for="i in 64" :key="i" class="w-1 bg-studio-emerald rounded-full" :style="{ height: `${20 + (i % 7) * 10}%` }" />
              </div>

              <!-- Progress bar fill -->
              <div
                class="absolute left-0 top-0 bottom-0 bg-studio-indigo/30 border-r-2 border-studio-indigo pointer-events-none"
                :style="{ width: `${progressPercent}%` }"
              />

              <!-- Trim In Handle -->
              <div class="absolute left-4 top-0 bottom-0 w-2 bg-studio-amber rounded-l cursor-ew-resize flex items-center justify-center">
                <div class="w-0.5 h-3 bg-black/60" />
              </div>

              <!-- Trim Out Handle -->
              <div class="absolute right-6 top-0 bottom-0 w-2 bg-studio-amber rounded-r cursor-ew-resize flex items-center justify-center">
                <div class="w-0.5 h-3 bg-black/60" />
              </div>
            </div>

            <!-- Player Controls & Trim Buttons -->
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center space-x-2">
                <button
                  @click="togglePlay"
                  class="p-2 bg-white text-black hover:bg-gray-200 rounded-xl transition-colors font-medium text-xs flex items-center space-x-1.5"
                >
                  <Pause v-if="isPlaying" class="w-4 h-4 fill-current" />
                  <Play v-else class="w-4 h-4 fill-current" />
                  <span>{{ isPlaying ? 'Pause' : 'Play' }}</span>
                </button>

                <button class="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-gray-300 hover:text-white transition-colors">
                  <Scissors class="w-3.5 h-3.5 text-studio-amber" />
                  <span>Trim Dead Air</span>
                </button>
              </div>

              <!-- Export Actions -->
              <div class="flex items-center space-x-2">
                <button
                  @click="alert('Opening session assets folder with separate clean screen, raw camera, and WAV audio tracks')"
                  class="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-gray-300 hover:text-white transition-colors border border-white/10"
                >
                  <FolderOpen class="w-3.5 h-3.5 text-studio-indigo" />
                  <span>Open Session Folder</span>
                </button>

                <button
                  @click="alert('Exporting multi-track bundle for Premiere / DaVinci Resolve with ProRes / WebM alpha')"
                  class="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-studio-crimson hover:bg-red-600 text-xs font-semibold text-white transition-all shadow-lg shadow-red-500/25"
                >
                  <Download class="w-3.5 h-3.5" />
                  <span>Export Package</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab 2: AI Background Matting & Batch Drag-Drop -->
        <div v-else>
          <DragDropBgRemover />
        </div>
      </div>
    </div>
  </div>
</template>
