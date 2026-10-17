<script setup lang="ts">
import { shallowRef, computed } from 'vue';
import {
  Play,
  Pause,
  Scissors,
  Download,
  FolderOpen,
  ZoomIn,
  Sparkles,
  Monitor,
  Video,
  X,
  Film
} from 'lucide-vue-next';
import DragDropBgRemover from './DragDropBgRemover.vue';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const activeTab = shallowRef<'review' | 'batch_ai'>('review');
const isPlaying = shallowRef(false);
const currentTime = shallowRef(14.2);
const duration = shallowRef(42.0);
const isAutoZoomActive = shallowRef(true);
const isCameraPiPVisible = shallowRef(true);

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

function showAlert(msg: string) {
  window.alert(msg);
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/85 backdrop-blur-xl select-none font-sans">
    <div class="glass-panel w-full max-w-6xl h-[92vh] rounded-[28px] flex flex-col overflow-hidden border border-white/10 shadow-[0_32px_96px_rgba(0,0,0,0.95)]">
      <!-- Top Window Navigation Bar -->
      <div class="px-6 py-4 flex items-center justify-between border-b border-white/[0.08] bg-[#0E1017]">
        <div class="flex items-center space-x-3.5">
          <div class="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-studio-crimson shadow-[0_0_12px_rgba(255,59,48,0.2)]">
            <Film class="w-4 h-4" />
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h2 class="text-sm font-semibold tracking-wide text-white">Studio Review & Export</h2>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                MULTI-TRACK READY
              </span>
            </div>
            <p class="text-xs text-gray-400 font-mono mt-0.5">session_20261017_143245 • Clean Desktop + Isolated Camera</p>
          </div>
        </div>

        <!-- Sleek Segmented Switcher -->
        <div class="flex items-center space-x-1 p-1 rounded-2xl bg-black/50 border border-white/10 shadow-inner">
          <button
            @click="activeTab = 'review'"
            class="px-4 py-1.5 rounded-xl text-xs font-semibold transition-all"
            :class="activeTab === 'review' ? 'bg-white text-black shadow-md' : 'text-gray-400 hover:text-white'"
          >
            Review & Cut
          </button>
          <button
            @click="activeTab = 'batch_ai'"
            class="px-4 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5"
            :class="activeTab === 'batch_ai' ? 'btn-indigo text-white shadow-lg shadow-indigo-500/30' : 'text-gray-400 hover:text-white'"
          >
            <Sparkles class="w-3.5 h-3.5" />
            <span>AI Background Studio</span>
          </button>
        </div>

        <!-- Close Button -->
        <button
          @click="emit('close')"
          class="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          title="Close Modal"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Main Body Area -->
      <div class="flex-1 overflow-y-auto p-6 bg-[#0B0D13]">
        <!-- Tab 1: Review & Cut View -->
        <div v-if="activeTab === 'review'" class="space-y-6">
          <!-- Synchronized Video Viewport -->
          <div class="relative w-full aspect-video max-h-[52vh] rounded-2xl overflow-hidden bg-[#07080C] border border-white/10 shadow-2xl flex items-center justify-center group">
            <!-- Simulated Clean Screen Track Background (Code Editor / Desktop Mock) -->
            <div
              class="w-full h-full p-8 flex flex-col justify-between transition-all duration-700 bg-gradient-to-br from-[#12141D] to-[#0A0C14]"
              :class="isAutoZoomActive ? 'scale-110 origin-[30%_35%]' : 'scale-100'"
            >
              <!-- Window Bar Mockup -->
              <div class="flex items-center justify-between pb-4 border-b border-white/5 opacity-60">
                <div class="flex items-center space-x-2">
                  <div class="w-3 h-3 rounded-full bg-red-500/80" />
                  <div class="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div class="w-3 h-3 rounded-full bg-green-500/80" />
                  <span class="text-xs font-mono text-gray-400 ml-2">CleanScreenRecording.mp4</span>
                </div>
                <span class="text-xs font-mono text-gray-500">60 FPS • ProRes 422</span>
              </div>

              <!-- Center Graphic -->
              <div class="flex flex-col items-center justify-center my-auto">
                <div class="w-20 h-20 rounded-2xl bg-indigo-500/10 border border-indigo-400/20 flex items-center justify-center mb-3 shadow-[0_0_32px_rgba(99,102,241,0.2)]">
                  <Monitor class="w-10 h-10 text-indigo-400" />
                </div>
                <h3 class="text-base font-semibold text-white tracking-wide">
                  Clean Desktop Canvas (Excludes All Overlays)
                </h3>
                <p class="text-xs text-gray-400 font-mono mt-1">
                  1920 × 1080 @ 60 FPS • Complete freedom to reposition webcam in video editor
                </p>
              </div>

              <!-- Bottom Status -->
              <div class="flex items-center justify-between text-xs font-mono text-gray-500 pt-3 border-t border-white/5">
                <span>Display 1 • Primary</span>
                <span>telemetry_cursor.json synchronized</span>
              </div>
            </div>

            <!-- Picture-in-Picture Decoupled Camera Track Preview -->
            <div
              v-if="isCameraPiPVisible"
              class="absolute bottom-6 right-6 w-52 aspect-square rounded-[36px] border-2 border-red-500/80 bg-[#161822] shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col items-center justify-center text-white"
            >
              <div class="w-14 h-14 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center mb-2 shadow-inner">
                <Video class="w-7 h-7 text-indigo-300" />
              </div>
              <span class="text-xs font-semibold tracking-wide">Isolated Camera Feed</span>
              <span class="text-[10px] text-emerald-400 font-mono mt-0.5">camera_raw.mp4</span>
            </div>

            <!-- Auto-Zoom Indicator Badge -->
            <div
              v-if="isAutoZoomActive"
              class="absolute top-4 left-4 px-3.5 py-1.5 rounded-full bg-indigo-950/80 border border-indigo-400/40 text-xs font-semibold text-indigo-200 flex items-center space-x-2 backdrop-blur-md shadow-lg"
            >
              <ZoomIn class="w-3.5 h-3.5 text-indigo-300" />
              <span>Screen-Studio Auto-Zoom (Active Preview)</span>
            </div>
          </div>

          <!-- Timeline Scrubber & Trim Handles -->
          <div class="p-5 rounded-2xl glass-card space-y-4 border border-white/[0.08]">
            <div class="flex items-center justify-between text-xs font-mono text-gray-300">
              <div class="flex items-center space-x-2 bg-black/40 px-3 py-1.5 rounded-xl border border-white/5">
                <span class="text-white font-semibold">{{ formatTime(currentTime) }}</span>
                <span class="text-gray-500">/</span>
                <span class="text-gray-400">{{ formatTime(duration) }}</span>
              </div>

              <!-- Viewport Toggles -->
              <div class="flex items-center space-x-4">
                <label class="flex items-center space-x-2 cursor-pointer text-gray-300 hover:text-white">
                  <input
                    type="checkbox"
                    v-model="isAutoZoomActive"
                    class="rounded accent-indigo-500"
                  />
                  <span class="font-sans font-medium text-xs">Simulate Cursor Auto-Zoom</span>
                </label>
                <div class="h-3 w-px bg-white/10" />
                <label class="flex items-center space-x-2 cursor-pointer text-gray-300 hover:text-white">
                  <input
                    type="checkbox"
                    v-model="isCameraPiPVisible"
                    class="rounded accent-red-500"
                  />
                  <span class="font-sans font-medium text-xs">Show Camera PiP</span>
                </label>
              </div>
            </div>

            <!-- Waveform & Scrub Track -->
            <div class="relative w-full h-10 bg-black/60 rounded-xl overflow-hidden flex items-center cursor-pointer px-1 border border-white/5 shadow-inner">
              <!-- Audio waveform visualization -->
              <div class="absolute inset-0 flex items-center justify-between px-3 opacity-35 pointer-events-none">
                <div
                  v-for="i in 80"
                  :key="i"
                  class="w-1 bg-gradient-to-t from-emerald-500 to-emerald-300 rounded-full"
                  :style="{ height: `${25 + (Math.sin(i * 0.4) * 0.5 + 0.5) * 60}%` }"
                />
              </div>

              <!-- Progress bar fill -->
              <div
                class="absolute left-0 top-0 bottom-0 bg-indigo-500/25 border-r-2 border-indigo-400 pointer-events-none shadow-[0_0_12px_rgba(99,102,241,0.5)]"
                :style="{ width: `${progressPercent}%` }"
              />

              <!-- Trim In Handle -->
              <div class="absolute left-6 top-0 bottom-0 w-2.5 bg-amber-400 rounded-l cursor-ew-resize flex items-center justify-center shadow-lg">
                <div class="w-0.5 h-3 bg-black/70" />
              </div>

              <!-- Trim Out Handle -->
              <div class="absolute right-8 top-0 bottom-0 w-2.5 bg-amber-400 rounded-r cursor-ew-resize flex items-center justify-center shadow-lg">
                <div class="w-0.5 h-3 bg-black/70" />
              </div>
            </div>

            <!-- Player Controls & Export Bar -->
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center space-x-3">
                <button
                  @click="togglePlay"
                  class="px-4 py-2 bg-white text-black hover:bg-gray-200 rounded-xl transition-all font-semibold text-xs flex items-center space-x-2 shadow-lg active:scale-95"
                >
                  <Pause v-if="isPlaying" class="w-3.5 h-3.5 fill-current" />
                  <Play v-else class="w-3.5 h-3.5 fill-current" />
                  <span>{{ isPlaying ? 'Pause' : 'Play' }}</span>
                </button>

                <button class="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-gray-200 hover:text-white transition-all border border-white/5">
                  <Scissors class="w-3.5 h-3.5 text-amber-400" />
                  <span>Trim Dead Air</span>
                </button>
              </div>

              <!-- Export Actions -->
              <div class="flex items-center space-x-3">
                <button
                  @click="showAlert('Opening session assets folder:\n• screen_clean.mp4\n• camera_raw.mp4\n• audio_mic.wav\n• audio_system.wav\n• telemetry.json')"
                  class="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-gray-200 hover:text-white transition-all border border-white/10"
                >
                  <FolderOpen class="w-4 h-4 text-indigo-400" />
                  <span>Open Session Assets</span>
                </button>

                <button
                  @click="showAlert('Exporting synced package for Premiere Pro / DaVinci Resolve with ProRes 4444 / WebM Alpha.')"
                  class="btn-primary flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-95 cursor-pointer"
                >
                  <Download class="w-4 h-4" />
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
