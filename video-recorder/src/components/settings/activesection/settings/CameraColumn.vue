<script setup lang="ts">
import {
  Video,
  VideoOff,
  Check,
  RefreshCw,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Cpu,
  Zap,
} from 'lucide-vue-next';
import { computed, onMounted, shallowRef, watch } from 'vue';
import { useStudioState } from '@/composables/useStudioState';
import { useMediaDevices } from '@/composables/useMediaDevices';
import type { BgModelType } from '@/types/studio';
import { fetchAvailableModels, updateCameraBackgroundMode, type DaemonModelInfo } from '@/lib/tauriBridge';

const emit = defineEmits<{
  (e: 'openBackgrounds'): void;
}>();

const {
  isCameraHidden,
  selectedCameraId,
  bgMode,
  selectedBgModel,
} = useStudioState();

const { cameras, refreshDevices } = useMediaDevices();

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
    size: '172 MB',
    latency: '~110ms',
    description: 'Fine edge refinement model preserving individual hair strands and semi-transparent clothing borders.',
  },
  {
    id: 'birefnet_hq',
    name: 'BiRefNet Ultra',
    fileName: 'birefnet_general.onnx',
    badge: 'Cinema Quality',
    badgeColor: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
    size: '190 MB',
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

watch(selectedBgModel, (newModel) => {
  updateCameraBackgroundMode(bgMode.value, newModel);
});
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

    <!-- AI Background Removal Model Picker -->
    <div class="space-y-2 pt-3 border-t border-white/10">
      <div class="flex items-center justify-between">
        <label class="text-[10px] font-mono uppercase text-white/50 flex items-center gap-1.5">
          <Cpu class="w-3.5 h-3.5 text-indigo-400" />
          <span>AI Matting Model</span>
        </label>
        <span class="text-[10px] font-mono text-indigo-400/80 flex items-center gap-1">
          <Sparkles class="w-3 h-3 text-indigo-400" />
          <span>Neural Net</span>
        </span>
      </div>

      <!-- Styled Model Selector -->
      <div class="relative">
        <select
          v-model="selectedBgModel"
          class="w-full appearance-none bg-white/5 hover:bg-white/10 border border-white/10 focus:border-indigo-400/50 rounded-xl px-3.5 py-2.5 pr-9 text-xs text-white font-medium transition cursor-pointer"
        >
          <option
            v-for="model in BG_MODEL_OPTIONS"
            :key="model.id"
            :value="model.id"
            class="bg-[#12141d] text-white"
          >
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

        <div class="pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px] text-white/50 font-mono">
          <div class="flex items-center gap-1.5">
            <span
              :class="[
                'w-1.5 h-1.5 rounded-full',
                isCurrentModelDownloaded ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-amber-400'
              ]"
            />
            <span>{{ isCurrentModelDownloaded ? 'Cached in studio/.cache' : 'Auto-downloads on demand' }}</span>
          </div>
          <span class="text-white/30">FP32 Tensor</span>
        </div>
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
