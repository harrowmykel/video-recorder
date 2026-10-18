<script setup lang="ts">
import { useTemplateRef, computed, onMounted, shallowRef, watch } from 'vue';
import {
  Sparkles, Upload, Video, VideoOff,
  ChevronDown,
  Cpu,
  Zap,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  FolderOpen,
  RefreshCw,
  Palette,
  Check,
} from 'lucide-vue-next';
import CameraBubble from '@/components/camera/CameraBubble.vue';
import { useStudioState } from '@/composables/useStudioState';
import { useMediaDevices } from '@/composables/useMediaDevices';
import type { BgModelType, SavedBgImage } from '@/types/studio';
import {
  fetchAvailableModels,
  downloadModel,
  updateCameraBackgroundMode,
  openExportDirectory,
  STUDIO_BG_IMAGES_DIR,
  type DaemonModelInfo,
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
  selectedBgModel,
  bgEngine,
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
interface BgModelOption {
  id: BgModelType;
  name: string;
  fileName: string;
  badge: string;
  badgeColor: string;
  size: string;
  latency: string;
  description: string;
}

const BG_MODEL_OPTIONS: BgModelOption[] = [
  {
    id: 'mediapipe_fast',
    name: 'MediaPipe Selfie',
    fileName: 'selfie_segmentation.onnx',
    badge: 'Ultra-Fast',
    badgeColor: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
    size: '0.45 MB',
    latency: '<25ms',
    description: 'Ultra-low latency neural matting running via Tract SIMD on local CPU. Recommended for 30+ FPS live preview.',
  },
  {
    id: 'rvm_video',
    name: 'Robust Video Matting',
    fileName: 'rvm_mobilenetv3.onnx',
    badge: 'Temporal Sync',
    badgeColor: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30',
    size: '15.2 MB',
    latency: '~45ms',
    description: 'Recurrent video matting with temporal memory to eliminate flickering and stabilize boundary silhouettes.',
  },
  {
    id: 'rmbg_1_4',
    name: 'RMBG-1.4 Studio',
    fileName: 'rmbg_1_4.onnx',
    badge: 'Hair-Level HQ',
    badgeColor: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
    size: '176 MB',
    latency: '~110ms',
    description: 'Fine edge refinement model preserving individual hair strands and semi-transparent clothing borders.',
  },
  {
    id: 'birefnet_hq',
    name: 'BiRefNet Ultra',
    fileName: 'birefnet_general.onnx',
    badge: 'Cinema Quality',
    badgeColor: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
    size: '224 MB',
    latency: '~140ms',
    description: 'Bilateral reference network for cinema-grade edge detail in offline batch extraction and studio recording.',
  },
];

const currentModel = computed(() => {
  return BG_MODEL_OPTIONS.find((m) => m.id === selectedBgModel.value) || BG_MODEL_OPTIONS[0];
});

const daemonModels = shallowRef<DaemonModelInfo[]>([]);

onMounted(async () => {
  daemonModels.value = await fetchAvailableModels();
});

const isCurrentModelDownloaded = computed(() => {
  const dm = daemonModels.value.find((m) => m.file_name === currentModel.value.fileName);
  if (currentModel.value.id === 'mediapipe_fast') return true;
  return Boolean(dm?.is_downloaded);
});

const isDownloading = shallowRef(false);
const downloadError = shallowRef<string | null>(null);

async function handleDownloadModel() {
  if (isDownloading.value || isCurrentModelDownloaded.value) return;
  isDownloading.value = true;
  downloadError.value = null;
  try {
    const res = await downloadModel(currentModel.value.fileName);
    if (res.success) {
      daemonModels.value = await fetchAvailableModels();
    } else {
      downloadError.value = res.error || 'Failed to download model';
    }
  } catch (err: any) {
    downloadError.value = err?.message || 'Download network error';
  } finally {
    isDownloading.value = false;
  }
}

watch(selectedBgModel, (newModel) => {
  updateCameraBackgroundMode(bgMode.value, newModel);
});
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
            <button
              v-for="preset in solidColorPresets"
              :key="preset.id"
              type="button"
              @click="handleSelectColor(preset.value)"
              class="group relative h-11 rounded-xl border transition-all flex items-center justify-center overflow-hidden shadow-md"
              :class="[
                bgMode === 'color' && bgColor.toUpperCase() === preset.value.toUpperCase()
                  ? 'border-emerald-400 ring-2 ring-emerald-400/40 scale-105 shadow-emerald-500/20'
                  : 'border-white/15 hover:border-white/60 hover:scale-[1.02]'
              ]"
              :style="{ backgroundColor: preset.value }"
              :title="preset.name"
            >
              <div
                v-if="bgMode === 'color' && bgColor.toUpperCase() === preset.value.toUpperCase()"
                class="w-4 h-4 rounded-full flex items-center justify-center shadow"
                :class="preset.value === '#FFFFFF' || preset.value === '#FDF8F0' ? 'bg-black text-white' : 'bg-white text-black'"
              >
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
                <div class="text-[11px] text-white/50">Stored automatically in ~/Videos/studio/bg-images
                </div>
              </div>
            </div>
            <span class="px-3 py-1.5 rounded-xl bg-indigo-500 text-white text-xs font-semibold shadow">
              Choose Image...
            </span>
            <input ref="bgUploadInput" type="file" accept="image/*" class="hidden" @change="handleBgImageFileChange" />
          </div>
        </div>

        <!-- Recently Used / Saved Background Images from ~/Videos/studio/bg-images -->
        <div class="space-y-2.5 pt-2 border-t border-white/10">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <label class="text-[11px] font-mono uppercase text-white/50 block">Recently Used Background Images</label>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-white/70">
                {{ savedBgImages.length }} saved
              </span>
            </div>
            <div class="flex items-center gap-1.5">
              <button
                @click="loadSavedBgImages"
                class="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"
                title="Refresh saved backgrounds folder"
              >
                <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isLoadingSavedBgImages }" />
              </button>
              <button
                @click="openExportDirectory(STUDIO_BG_IMAGES_DIR)"
                class="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-white/70 hover:text-white flex items-center gap-1.5 transition"
                title="Open bg-images folder in file manager"
              >
                <FolderOpen class="w-3.5 h-3.5 text-amber-400" />
                <span>Open Folder</span>
              </button>
            </div>
          </div>

          <!-- Grid of Saved Background Images -->
          <div v-if="savedBgImages.length > 0" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div
              v-for="img in savedBgImages"
              :key="img.id"
              @click="handleSelectSavedImage(img)"
              class="group relative h-24 rounded-2xl border overflow-hidden cursor-pointer transition shadow-md"
              :class="[
                bgMode === 'image' && bgImageUrl === img.dataUrl
                  ? 'border-emerald-400 ring-2 ring-emerald-400/40 shadow-emerald-500/20'
                  : 'border-white/15 hover:border-white/50 hover:shadow-lg'
              ]"
            >
              <img :src="img.dataUrl" :alt="img.name" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
              <!-- Top-Right Delete "X" Button -->
              <button
                type="button"
                @click.stop="handleDeleteSavedBg(img)"
                class="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/80 hover:bg-rose-500 text-white/70 hover:text-white transition shadow opacity-80 group-hover:opacity-100 z-10"
                title="Delete image from disk"
              >
                <X class="w-3.5 h-3.5" />
              </button>
              <!-- Bottom Filename Gradient Banner -->
              <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-1.5 pt-3">
                <span class="text-[10px] text-white/90 font-medium truncate block">
                  {{ img.name }}
                </span>
              </div>
              <!-- Active Selection Checkmark Badge -->
              <div
                v-if="bgMode === 'image' && bgImageUrl === img.dataUrl"
                class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-emerald-500 text-black text-[9px] font-bold flex items-center gap-1 shadow"
              >
                <Check class="w-2.5 h-2.5 stroke-[3]" />
                <span>ACTIVE</span>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-else
            class="p-4 rounded-2xl bg-white/[0.03] border border-white/5 text-center text-xs text-white/40 flex flex-col items-center justify-center space-y-1"
          >
            <p>No saved background images yet.</p>
            <p class="text-[10px] text-white/30">Upload or drag & drop an image above to store it in <code class="text-white/50 font-mono">~/Videos/studio/bg-images</code>.</p>
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

        <!-- Real-Time Processing Engine: Rust Daemon vs JS MediaPipe -->
        <div class="space-y-2 pt-3 border-t border-white/10">
          <div class="flex items-center justify-between">
            <label class="text-[10px] font-mono uppercase text-white/50 flex items-center gap-1.5">
              <Zap class="w-3.5 h-3.5 text-amber-400" />
              <span>Real-Time Engine</span>
            </label>
            <span class="text-[10px] font-mono text-white/40">
              {{ bgEngine === 'rust' ? 'Rust Tract SIMD Active' : 'MediaPipe WebAssembly Active' }}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- Rust Option -->
            <button
              type="button"
              @click="bgEngine = 'rust'"
              :class="[
                'p-3.5 rounded-2xl border text-left transition relative flex flex-col justify-between space-y-2 cursor-pointer',
                bgEngine === 'rust'
                  ? 'bg-rose-500/15 border-rose-400/60 shadow-lg shadow-rose-950/40 text-white'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/70 hover:text-white'
              ]"
            >
              <div class="flex items-center justify-between w-full">
                <div class="flex items-center gap-2">
                  <div :class="['w-7 h-7 rounded-lg flex items-center justify-center', bgEngine === 'rust' ? 'bg-rose-500 text-white' : 'bg-white/10 text-white/60']">
                    <Zap class="w-4 h-4" />
                  </div>
                  <div>
                    <div class="text-xs font-bold text-white">Rust (Optimized)</div>
                    <div class="text-[10px] text-white/50">Native SIMD Capture Daemon</div>
                  </div>
                </div>
                <span class="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border text-rose-300 bg-rose-500/20 border-rose-400/30">
                  Fastest
                </span>
              </div>
              <p class="text-[11px] text-white/60 leading-relaxed">
                Offloads neural matting to background Rust daemon using Tract ONNX with SIMD. Lowest CPU & browser overhead.
              </p>
            </button>

            <!-- JS Option -->
            <button
              type="button"
              @click="bgEngine = 'js'"
              :class="[
                'p-3.5 rounded-2xl border text-left transition relative flex flex-col justify-between space-y-2 cursor-pointer',
                bgEngine === 'js'
                  ? 'bg-indigo-500/15 border-indigo-400/60 shadow-lg shadow-indigo-950/40 text-white'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/70 hover:text-white'
              ]"
            >
              <div class="flex items-center justify-between w-full">
                <div class="flex items-center gap-2">
                  <div :class="['w-7 h-7 rounded-lg flex items-center justify-center', bgEngine === 'js' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white/60']">
                    <Sparkles class="w-4 h-4" />
                  </div>
                  <div>
                    <div class="text-xs font-bold text-white">JS (In-Browser)</div>
                    <div class="text-[10px] text-white/50">MediaPipe WebAssembly & GPU</div>
                  </div>
                </div>
                <span class="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border text-indigo-300 bg-indigo-500/20 border-indigo-400/30">
                  Browser GPU
                </span>
              </div>
              <p class="text-[11px] text-white/60 leading-relaxed">
                Client-side pipeline via Google MediaPipe Tasks Vision. Direct WebGL confidence mask composite and full custom backdrop support.
              </p>
            </button>
          </div>
        </div>

        <!-- AI Background Removal Model Picker -->
        <div class="space-y-2 pt-3 border-t border-white/10">
          <div class="flex items-center justify-between">
            <label class="text-[10px] font-mono uppercase text-white/50 flex items-center gap-1.5">
              <Cpu class="w-3.5 h-3.5 text-indigo-400" />
              <span>{{ bgEngine === 'rust' ? 'Rust ONNX Matting Model' : 'In-Browser MediaPipe Model' }}</span>
            </label>
            <span class="text-[10px] font-mono text-indigo-400/80 flex items-center gap-1">
              <Sparkles class="w-3 h-3 text-indigo-400" />
              <span>{{ bgEngine === 'rust' ? 'Tract SIMD' : 'WebGL Shaders' }}</span>
            </span>
          </div>

          <!-- Styled Model Selector -->
          <div class="relative">
            <select v-model="selectedBgModel"
              class="w-full appearance-none bg-white/5 hover:bg-white/10 border border-white/10 focus:border-indigo-400/50 rounded-xl px-3.5 py-2.5 pr-9 text-xs text-white font-medium transition cursor-pointer">
              <option v-for="model in BG_MODEL_OPTIONS" :key="model.id" :value="model.id"
                class="bg-[#12141d] text-white">
                {{ model.name }} ({{ model.badge }} • {{ model.size }})
              </option>
            </select>
            <ChevronDown class="w-4 h-4 text-white/40 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <!-- Model Spec & Status Card -->
          <div class="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span :class="['text-[10px] font-semibold px-2 py-0.5 rounded-lg border', currentModel.badgeColor]">
                  {{ currentModel.badge }}
                </span>
                <span class="text-xs font-semibold text-white">{{ currentModel.name }}</span>
              </div>

              <div class="flex items-center gap-1.5 text-[11px] font-mono">
                <span class="flex items-center gap-1 text-amber-300">
                  <Zap class="w-3 h-3" />
                  {{ currentModel.latency }}
                </span>
                <span class="text-white/30">•</span>
                <span class="text-white/50">{{ currentModel.size }}</span>
              </div>
            </div>

            <p class="text-[11px] text-white/55 leading-relaxed">
              {{ currentModel.description }}
            </p>

            <div
              class="pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px] text-white/50 font-mono">
              <div class="flex items-center gap-1.5">
                <span :class="[
                  'w-1.5 h-1.5 rounded-full',
                  isCurrentModelDownloaded ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-amber-400'
                ]" />
                <span>{{ isCurrentModelDownloaded ? 'Cached in studio/.cache' : 'Auto-downloads on demand' }}</span>
              </div>
              <span class="text-white/30">FP32 Tensor</span>
            </div>
          </div>

          <!-- Download Action Button / Ready Indicator -->
          <div class="pt-1">
            <div v-if="isCurrentModelDownloaded"
              class="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-medium">
              <div class="flex items-center gap-2">
                <CheckCircle2 class="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Model downloaded & ready for real-time matting</span>
              </div>
              <span class="text-[10px] font-mono uppercase bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300 border border-emerald-500/30">Ready</span>
            </div>

            <div v-else class="space-y-1.5">
              <button
                @click="handleDownloadModel"
                :disabled="isDownloading"
                class="w-full py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition shadow-lg shadow-indigo-500/20 group cursor-pointer disabled:cursor-not-allowed"
              >
                <Loader2 v-if="isDownloading" class="w-4 h-4 animate-spin text-white" />
                <Download v-else class="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
                <span>{{ isDownloading ? `Downloading ${currentModel.name} (${currentModel.size})...` : `Download ${currentModel.name} (${currentModel.size})` }}</span>
              </button>
              <p v-if="downloadError" class="text-[11px] text-rose-400 flex items-center gap-1.5">
                <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                <span>{{ downloadError }}</span>
              </p>
            </div>
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
