<script setup lang="ts">
import { useTemplateRef, computed, shallowRef, onMounted } from 'vue';
import {
  Sparkles, Upload, Video, VideoOff,
  X,
  FolderOpen,
  RefreshCw,
  Palette,
  Check,
} from 'lucide-vue-next';
import CameraBubble from '@/components/camera/CameraBubble.vue';
import { useStudioState } from '@/composables/useStudioState';
import { useMediaDevices } from '@/composables/useMediaDevices';
import type { SavedBgImage } from '@/types/studio';
import {
  openExportDirectory,
  getDefaultBgImagesDirectory,
  STUDIO_BG_IMAGES_DIR,
} from '@/lib/tauriBridge';

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
  bgGradient,
  bgColor,
  savedBgImages,
  isLoadingSavedBgImages,
  bgPresets,
  loadSavedBgImages,
  setCustomBgImageFromFile,
  deleteBgImage,
} = useStudioState();

const { cameras } = useMediaDevices();
const bgUploadInput = useTemplateRef<HTMLInputElement>('bgUploadInput');

async function handleBgImageFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    await setCustomBgImageFromFile(file);
    if (input) input.value = '';
  }
}

async function handleBgDrop(e: DragEvent) {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('image/')) {
    await setCustomBgImageFromFile(file);
  }
}

const solidColorPresets = computed(() => bgPresets.filter((p) => p.type === 'color'));
const sceneryPresets = computed(() => bgPresets.filter((p) => p.type !== 'color'));

function handleSelectColor(colorHex: string) {
  bgMode.value = 'color';
  bgColor.value = colorHex;
}

function handleSelectSavedImage(item: SavedBgImage) {
  bgMode.value = 'image';
  bgImageUrl.value = item.dataUrl;
}

async function handleDeleteSavedBg(item: SavedBgImage) {
  await deleteBgImage(item);
}

const bgImagesDirDisplay = shallowRef<string>(STUDIO_BG_IMAGES_DIR);

onMounted(async () => {
  bgImagesDirDisplay.value = await getDefaultBgImagesDirectory();
});

async function handleOpenBgFolder() {
  const dir = await getDefaultBgImagesDirectory();
  await openExportDirectory(dir);
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

        <!-- 6 Background Modes -->
        <div class="space-y-2">
          <label class="text-[11px] font-mono uppercase text-white/50 block">Background Mode</label>
          <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <button v-for="mode in (['off', 'blur', 'transparent', 'color', 'image', 'gradient'] as const)" :key="mode"
              @click="bgMode = mode" :class="[
                'py-2 px-2 rounded-xl text-xs font-semibold capitalize border transition text-center',
                bgMode === mode
                  ? 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/20'
                  : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
              ]">
              {{ mode === 'transparent' ? 'Cutout' : (mode === 'color' ? 'Solid Color' : mode) }}
            </button>
          </div>
        </div>

        <!-- Solid Color Studio Backdrops -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-mono uppercase text-white/50 flex items-center gap-1.5">
              <Palette class="w-3.5 h-3.5 text-rose-400" />
              <span>Solid Studio Colors</span>
            </label>
            <span class="text-[10px] font-mono text-white/40">Clean High-Contrast Keying</span>
          </div>
          <div class="grid grid-cols-7 gap-2">
            <button v-for="preset in solidColorPresets" :key="preset.id" type="button"
              @click="handleSelectColor(preset.value)"
              class="group relative h-11 rounded-xl border transition-all flex items-center justify-center overflow-hidden shadow-md"
              :class="[
                bgMode === 'color' && bgColor.toUpperCase() === preset.value.toUpperCase()
                  ? 'border-emerald-400 ring-2 ring-emerald-400/40 scale-105 shadow-emerald-500/20'
                  : 'border-white/15 hover:border-white/60 hover:scale-[1.02]'
              ]" :style="{ backgroundColor: preset.value }" :title="preset.name">
              <div v-if="bgMode === 'color' && bgColor.toUpperCase() === preset.value.toUpperCase()"
                class="w-4 h-4 rounded-full flex items-center justify-center shadow"
                :class="preset.value === '#FFFFFF' || preset.value === '#FDF8F0' ? 'bg-black text-white' : 'bg-white text-black'">
                <Check class="w-2.5 h-2.5 stroke-[3]" />
              </div>
            </button>
          </div>
        </div>

        <!-- Upload Custom Image Zone -->
        <div class="space-y-2">
          <label class="text-[11px] font-mono uppercase text-white/50 block">Custom Background Image</label>
          <div @click="bgUploadInput?.click()"
            class="p-4 rounded-2xl border-2 border-dashed border-indigo-400/30 hover:border-indigo-400/70 bg-indigo-500/5 hover:bg-indigo-500/10 cursor-pointer transition flex items-center justify-between">
            <div class="flex items-center gap-3.5">
              <div
                class="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                <Upload class="w-5 h-5" />
              </div>
              <div>
                <div class="text-xs font-bold text-white">Upload or Drag & Drop Any Image</div>
                <div class="text-[11px] text-white/50">Stored in {{ bgImagesDirDisplay }}
                </div>
              </div>
            </div>
            <span class="px-3 py-1.5 rounded-xl bg-indigo-500 text-white text-xs font-semibold shadow">
              Choose Image...
            </span>
            <input ref="bgUploadInput" type="file" accept="image/*" class="hidden" @change="handleBgImageFileChange" />
          </div>
        </div>

        <!-- Recently Used / Saved Background Images from bg-images -->
        <div class="space-y-2.5 pt-2 border-t border-white/10">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <label class="text-[11px] font-mono uppercase text-white/50 block">Recently Used Background Images</label>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-white/70">
                {{ savedBgImages.length }} saved
              </span>
            </div>
            <div class="flex items-center gap-1.5">
              <button @click="loadSavedBgImages"
                class="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"
                title="Refresh saved backgrounds folder">
                <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isLoadingSavedBgImages }" />
              </button>
              <button @click="handleOpenBgFolder"
                class="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-white/70 hover:text-white flex items-center gap-1.5 transition"
                title="Open bg-images folder in file manager">
                <FolderOpen class="w-3.5 h-3.5 text-amber-400" />
                <span>Open Folder</span>
              </button>
            </div>
          </div>

          <!-- Grid of Saved Background Images -->
          <div v-if="savedBgImages.length > 0" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div v-for="img in savedBgImages" :key="img.id" @click="handleSelectSavedImage(img)"
              class="group relative h-24 rounded-2xl border overflow-hidden cursor-pointer transition shadow-md" :class="[
                bgMode === 'image' && bgImageUrl === img.dataUrl
                  ? 'border-emerald-400 ring-2 ring-emerald-400/40 shadow-emerald-500/20'
                  : 'border-white/15 hover:border-white/50 hover:shadow-lg'
              ]">
              <img :src="img.dataUrl" :alt="img.name"
                class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
              <!-- Top-Right Delete "X" Button -->
              <button type="button" @click.stop="handleDeleteSavedBg(img)"
                class="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/80 hover:bg-rose-500 text-white/70 hover:text-white transition shadow opacity-80 group-hover:opacity-100 z-10"
                title="Delete image from disk">
                <X class="w-3.5 h-3.5" />
              </button>
              <!-- Bottom Filename Gradient Banner -->
              <div
                class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-1.5 pt-3">
                <span class="text-[10px] text-white/90 font-medium truncate block">
                  {{ img.name }}
                </span>
              </div>
              <!-- Active Selection Checkmark Badge -->
              <div v-if="bgMode === 'image' && bgImageUrl === img.dataUrl"
                class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-emerald-500 text-black text-[9px] font-bold flex items-center gap-1 shadow">
                <Check class="w-2.5 h-2.5 stroke-[3]" />
                <span>ACTIVE</span>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else
            class="p-4 rounded-2xl bg-white/[0.03] border border-white/5 text-center text-xs text-white/40 flex flex-col items-center justify-center space-y-1">
            <p>No saved background images yet.</p>
            <p class="text-[10px] text-white/30">Upload or drag & drop an image above to store it in <code
                class="text-white/50 font-mono">{{ bgImagesDirDisplay }}</code>.</p>
          </div>
        </div>

        <!-- Studio Preset Backdrops -->
        <div class="space-y-2">
          <label class="text-[11px] font-mono uppercase text-white/50 block">Studio Scenery Presets</label>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button v-for="preset in sceneryPresets" :key="preset.id"
              @click="bgMode = preset.type; if (preset.type === 'image') bgImageUrl = preset.value; else if (preset.type === 'gradient') bgGradient = preset.value;"
              class="h-20 rounded-2xl border border-white/15 hover:border-white/60 overflow-hidden relative group transition shadow-lg"
              :class="{ 'border-emerald-400 ring-2 ring-emerald-400/40': (bgMode === preset.type && ((preset.type === 'image' && bgImageUrl === preset.value) || (preset.type === 'gradient' && bgGradient === preset.value))) }"
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

        <!-- Real-Time Processing Engine Status -->
        <div class="space-y-2 pt-3 border-t border-white/10">
          <div class="flex items-center justify-between">
            <label class="text-[10px] font-mono uppercase text-white/50 flex items-center gap-1.5">
              <Sparkles class="w-3.5 h-3.5 text-indigo-400" />
              <span>Real-Time Engine</span>
            </label>
            <span class="text-[10px] font-mono text-indigo-400/80">
              MediaPipe WebAssembly & GPU Active
            </span>
          </div>

          <div class="p-3.5 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <Sparkles class="w-4 h-4" />
              </div>
              <div>
                <div class="text-xs font-bold text-white">Browser Accelerated Matting</div>
                <div class="text-[10px] text-white/50">Client-side WebGL GPU shader matting & alpha cutouts</div>
              </div>
            </div>
            <span
              class="text-[9px] font-mono uppercase px-2 py-0.5 rounded border text-indigo-300 bg-indigo-500/20 border-indigo-400/30">
              WebGL GPU
            </span>
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
