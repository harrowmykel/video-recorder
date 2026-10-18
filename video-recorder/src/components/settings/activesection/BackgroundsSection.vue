<script setup lang="ts">
import { useTemplateRef } from 'vue';
import { Sparkles, Upload, Video, VideoOff } from 'lucide-vue-next';
import CameraBubble from '../../camera/CameraBubble.vue';
import { useStudioState } from '../../../composables/useStudioState.ts';
import { useMediaDevices } from '../../../composables/useMediaDevices.ts';

const props = defineProps<{
  audioVolume: number;
}>();

const {
  recordingState,
  isCameraHidden,
  selectedCameraId,
  cameraShape,
  cameraSize,
  cameraCustomDiameter,
  isCameraMirrored,
  bgMode,
  bgImageUrl,
  bgPresets,
  setCustomBgImageFromFile,
} = useStudioState();

const { cameras } = useMediaDevices();
const bgUploadInput = useTemplateRef<HTMLInputElement>('bgUploadInput');

async function handleBgImageFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    await setCustomBgImageFromFile(file);
  }
}

async function handleBgDrop(e: DragEvent) {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('image/')) {
    await setCustomBgImageFromFile(file);
  }
}
</script>

<template>
  <main @dragover.prevent @drop="handleBgDrop" class="flex-1 overflow-y-auto p-6 md:p-8 z-20">
    <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <!-- Left 7 Cols: Background Mode, Custom Image Upload, Presets & Camera Geometry -->
      <div class="lg:col-span-7 p-6 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-2xl space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <Sparkles class="w-5 h-5 text-rose-400" />
              <span>Real-Time Camera Background Replacement</span>
            </h3>
            <p class="text-xs text-white/50 mt-0.5">
              Replace your webcam background in real time with any custom image, studio preset, blur, or alpha cutout
            </p>
          </div>
        </div>

        <!-- 5 Background Modes -->
        <div class="space-y-2">
          <label class="text-[11px] font-mono uppercase text-white/50 block">Background Mode</label>
          <div class="grid grid-cols-5 gap-2">
            <button v-for="mode in (['off', 'blur', 'transparent', 'image', 'gradient'] as const)" :key="mode"
              @click="bgMode = mode" :class="[
                'py-2.5 px-3 rounded-xl text-xs font-semibold capitalize border transition',
                bgMode === mode
                  ? 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/20'
                  : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
              ]">
              {{ mode === 'transparent' ? 'Cutout' : mode }}
            </button>
          </div>
        </div>

        <!-- Upload Custom Image Zone -->
        <div class="space-y-2">
          <label class="text-[11px] font-mono uppercase text-white/50 block">Custom Background Image</label>
          <div @click="bgUploadInput?.click()"
            class="p-5 rounded-2xl border-2 border-dashed border-indigo-400/30 hover:border-indigo-400/70 bg-indigo-500/5 hover:bg-indigo-500/10 cursor-pointer transition flex items-center justify-between">
            <div class="flex items-center gap-3.5">
              <div
                class="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                <Upload class="w-5 h-5" />
              </div>
              <div>
                <div class="text-xs font-bold text-white">Upload or Drag & Drop Any Image</div>
                <div class="text-[11px] text-white/50">Supports PNG, JPG, WebP, SVG • Applied immediately in real time
                </div>
              </div>
            </div>
            <span class="px-3.5 py-1.5 rounded-xl bg-indigo-500 text-white text-xs font-semibold shadow">
              Choose Image...
            </span>
            <input ref="bgUploadInput" type="file" accept="image/*" class="hidden" @change="handleBgImageFileChange" />
          </div>
        </div>

        <!-- Studio Preset Backdrops -->
        <div class="space-y-2">
          <label class="text-[11px] font-mono uppercase text-white/50 block">Studio Background Presets</label>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button v-for="preset in bgPresets" :key="preset.id"
              @click="bgMode = preset.type; if (preset.type === 'image') bgImageUrl = preset.value;"
              class="h-20 rounded-2xl border border-white/15 hover:border-white/60 overflow-hidden relative group transition shadow-lg"
              :style="{ background: preset.thumbnail }" :title="preset.name">
              <div class="absolute inset-0 bg-black/20 group-hover:bg-transparent transition" />
              <span
                class="absolute inset-x-0 bottom-0 bg-black/75 text-[10px] text-white font-semibold py-1 px-2 truncate">
                {{ preset.name }}
              </span>
            </button>
          </div>
        </div>

        <!-- Camera Shape, Size & Mirror Controls -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-white/10">
          <div>
            <label class="text-[10px] font-mono uppercase text-white/50 block mb-1.5">Camera Shape</label>
            <div class="grid grid-cols-3 gap-1.5">
              <button v-for="sh in (['circle', 'squircle', 'rect16_9'] as const)" :key="sh" @click="cameraShape = sh"
                :class="['py-1.5 rounded-lg text-xs font-semibold border transition', cameraShape === sh ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/70']">
                {{ sh === 'rect16_9' ? '16:9' : sh }}
              </button>
            </div>
          </div>

          <div>
            <label class="text-[10px] font-mono uppercase text-white/50 block mb-1.5">Size Preset</label>
            <div class="grid grid-cols-4 gap-1.5">
              <button v-for="sz in (['S', 'M', 'L', 'fullscreen'] as const)" :key="sz"
                @click="cameraCustomDiameter = null; cameraSize = sz"
                :class="['py-1.5 rounded-lg text-xs font-bold border transition', cameraSize === sz && !cameraCustomDiameter ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/70']">
                {{ sz === 'fullscreen' ? 'XL' : sz }}
              </button>
            </div>
          </div>

          <div>
            <label class="text-[10px] font-mono uppercase text-white/50 block mb-1.5">Mirror Video</label>
            <button @click="isCameraMirrored = !isCameraMirrored"
              :class="['w-full py-1.5 rounded-lg text-xs font-semibold border transition', isCameraMirrored ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300' : 'bg-white/5 border-white/10 text-white/60']">
              {{ isCameraMirrored ? 'Mirrored (Horizontal Flip)' : 'Normal (Unmirrored)' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Right 5 Cols: Live Interactive Camera Bubble Preview -->
      <div
        class="lg:col-span-5 p-6 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-2xl flex flex-col items-center justify-center min-h-[420px] space-y-5">
        <div class="text-xs font-mono uppercase tracking-wider text-white/50">
          Live Real-Time Camera Preview <span v-if="selectedCameraId !== 'none'">(Mode: <span
              class="text-rose-400 font-bold">{{ bgMode }}</span>)</span>
        </div>

        <template v-if="selectedCameraId !== 'none'">
          <CameraBubble :is-hidden="false" :audio-volume="props.audioVolume"
            :is-recording="recordingState === 'recording'" @hide="isCameraHidden = true" />

          <p class="text-[11px] text-white/40 text-center max-w-xs">
            Hover over the camera frame above to test quick resize, shape morphing, or custom background image upload.
          </p>
        </template>

        <template v-else>
          <div class="flex flex-col items-center justify-center text-center p-8 space-y-4 max-w-sm">
            <div
              class="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-950/40">
              <VideoOff class="w-8 h-8" />
            </div>
            <div class="space-y-1">
              <h4 class="text-sm font-bold text-white">Camera Recording Disabled</h4>
              <p class="text-xs text-white/60 leading-relaxed">
                Recordings will capture clean screen and audio without a facecam overlay track.
              </p>
            </div>
            <button @click="selectedCameraId = cameras[0]?.deviceId || 'default'; isCameraHidden = false;"
              class="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-2 shadow-lg transition">
              <Video class="w-3.5 h-3.5" />
              <span>Turn Camera On</span>
            </button>
          </div>
        </template>
      </div>
    </div>
  </main>
</template>
