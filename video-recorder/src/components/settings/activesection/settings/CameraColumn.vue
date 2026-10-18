<script setup lang="ts">
import {
  Video,
  VideoOff,
  Check,
  RefreshCw,
  Sparkles,
  ChevronRight,
} from 'lucide-vue-next';
import { useStudioState } from '@/composables/useStudioState';
import { useMediaDevices } from '@/composables/useMediaDevices';

const emit = defineEmits<{
  (e: 'openBackgrounds'): void;
}>();

const {
  isCameraHidden,
  selectedCameraId
} = useStudioState();

const { cameras, refreshDevices } = useMediaDevices();

</script>

<template>
  <div class="p-5 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-xl space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div
          class="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
          <Video class="w-4 h-4" />
        </div>
        <div>
          <h3 class="text-sm font-bold text-white">2. Camera</h3>
          <p class="text-[11px] text-white/50">Camera hardware & input source</p>
        </div>
      </div>
      <button @click="refreshDevices(true)"
        class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
        title="Rescan Hardware Cameras">
        <RefreshCw class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Camera Device List -->
    <div class="space-y-1.5">
      <label class="text-[10px] font-mono uppercase text-white/50 block">Active Camera Device</label>
      <div class="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
        <!-- Dedicated No Camera (Screen Only) Option -->
        <button @click="selectedCameraId = 'none'; isCameraHidden = true" :class="[
          'w-full px-3.5 py-2.5 rounded-xl text-left text-xs flex items-center justify-between border transition',
          selectedCameraId === 'none'
            ? 'bg-rose-500/20 border-rose-400/50 text-white font-semibold'
            : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
        ]">
          <div class="flex items-center gap-2.5 truncate pr-2">
            <VideoOff class="w-4 h-4 text-rose-400 shrink-0" />
            <span class="truncate">No Camera (Screen Only)</span>
          </div>
          <Check v-if="selectedCameraId === 'none'" class="w-4 h-4 text-rose-400 shrink-0" />
        </button>

        <button v-for="cam in cameras" :key="cam.deviceId"
          @click="selectedCameraId = cam.deviceId; isCameraHidden = false" :class="[
            'w-full px-3.5 py-2.5 rounded-xl text-left text-xs flex items-center justify-between border transition',
            selectedCameraId === cam.deviceId
              ? 'bg-indigo-500/20 border-indigo-400/50 text-white font-semibold'
              : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
          ]">
          <div class="flex items-center gap-2.5 truncate pr-2">
            <Video class="w-4 h-4 text-indigo-400 shrink-0" />
            <span class="truncate">{{ cam.label }}</span>
          </div>
          <Check v-if="selectedCameraId === cam.deviceId" class="w-4 h-4 text-indigo-400 shrink-0" />
        </button>
      </div>
    </div>

    <!-- Action button to open Real-Time BG tab (activeSection = 'backgrounds') -->
    <div class="pt-3 border-t border-white/10">
      <button @click="emit('openBackgrounds')"
        class="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-semibold flex items-center justify-between transition group shadow-sm">
        <div class="flex items-center gap-2">
          <Sparkles class="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          <span>More camera settings</span>
        </div>
        <ChevronRight class="w-4 h-4 text-white/40 group-hover:text-white transition-colors" />
      </button>
    </div>
  </div>
</template>
