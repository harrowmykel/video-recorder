<script setup lang="ts">
import { useTemplateRef } from 'vue';
import {
  Video,
  VideoOff,
  Check,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-vue-next';
import { useStudioState } from '../../../../composables/useStudioState';
import { useMediaDevices } from '../../../../composables/useMediaDevices';

const {
  isCameraHidden,
  selectedCameraId,
  bgMode,
  bgImageUrl,
  bgPresets,
  setCustomBgImageFromFile,
} = useStudioState();

const { cameras, refreshDevices } = useMediaDevices();
const bgUploadInput = useTemplateRef<HTMLInputElement>('bgUploadInput');

async function handleBgImageFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    await setCustomBgImageFromFile(file);
  }
}
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
          <h3 class="text-sm font-bold text-white">2. Camera & Background</h3>
          <p class="text-[11px] text-white/50">Camera hardware & virtual backdrop</p>
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
      <div class="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
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

    <!-- Real-Time Background Setting (beneath camera devices like in popup) -->
    <div class="pt-3 border-t border-white/10">
      <div v-if="selectedCameraId !== 'none'" class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-mono uppercase tracking-wider text-white/50 flex items-center gap-1.5">
            <Sparkles class="w-3.5 h-3.5 text-rose-400" />
            <span>Real-Time Background Mode</span>
          </span>
          <button @click="bgUploadInput?.click()"
            class="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-300 text-[11px] font-semibold flex items-center gap-1 transition shadow-sm">
            <Upload class="w-3 h-3" />
            <span>Upload BG</span>
          </button>
          <input ref="bgUploadInput" type="file" accept="image/*" class="hidden" @change="handleBgImageFileChange" />
        </div>

        <!-- Background Mode Switcher (off, blur, cutout, image, gradient) -->
        <div class="grid grid-cols-5 gap-1.5">
          <button v-for="mode in (['off', 'blur', 'transparent', 'image', 'gradient'] as const)" :key="mode"
            @click="bgMode = mode" :class="[
              'py-1.5 px-1.5 rounded-xl text-[11px] font-semibold capitalize border transition text-center',
              bgMode === mode
                ? 'bg-rose-500 text-white border-rose-400 shadow'
                : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
            ]">
            {{ mode === 'transparent' ? 'Cutout' : mode }}
          </button>
        </div>

        <!-- Preset Studio Background Images Strip -->
        <div class="space-y-1">
          <span class="text-[10px] font-mono uppercase text-white/40 block">Studio Presets</span>
          <div class="grid grid-cols-4 gap-2">
            <button v-for="preset in bgPresets" :key="preset.id"
              @click="bgMode = preset.type; if (preset.type === 'image') bgImageUrl = preset.value;"
              class="h-12 rounded-xl border border-white/15 hover:border-white/50 overflow-hidden relative group transition"
              :style="{ background: preset.thumbnail }" :title="preset.name">
              <span
                class="absolute inset-x-0 bottom-0 bg-black/75 text-[9px] text-white font-medium py-0.5 truncate px-1">
                {{ preset.name }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Placeholder when Camera is Disabled -->
      <div v-else class="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 text-center space-y-1.5">
        <div class="flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-300">
          <VideoOff class="w-3.5 h-3.5" />
          <span>Camera Recording Disabled</span>
        </div>
        <p class="text-[11px] text-white/50">
          Select a camera device above to enable camera PiP, virtual backgrounds, and cutout modes.
        </p>
      </div>
    </div>
  </div>
</template>
