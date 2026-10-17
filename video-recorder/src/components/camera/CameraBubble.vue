<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  FlipHorizontal,
  Sparkles,
  EyeOff,
  Maximize2,
  Circle,
  Square,
  RectangleHorizontal,
  User
} from 'lucide-vue-next';
import { CameraShape, CameraSize, BgRemovalMode } from '../../types/studio';

const props = withDefaults(
  defineProps<{
    isHidden: boolean;
    audioVolume?: number;
    isRecording?: boolean;
  }>(),
  {
    isHidden: false,
    audioVolume: 0.35,
    isRecording: false,
  }
);

const emit = defineEmits<{
  (e: 'hide'): void;
}>();

const shape = ref<CameraShape>('circle');
const size = ref<CameraSize>('M');
const isMirrored = ref(true);
const bgMode = ref<BgRemovalMode>('off');
const hasCameraStream = ref(false);
const isHovered = ref(false);
const videoRef = ref<HTMLVideoElement | null>(null);

let mediaStream: MediaStream | null = null;

onMounted(async () => {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: false,
    });
    if (videoRef.value) {
      videoRef.value.srcObject = mediaStream;
      videoRef.value.play();
    }
    hasCameraStream.value = true;
  } catch (err) {
    console.log('Webcam not active, using fallback avatar:', err);
    hasCameraStream.value = false;
  }
});

onUnmounted(() => {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
  }
});

// Size dimensions
const dimensions = computed(() => {
  const map: Record<CameraSize, { width: number; height: number }> = {
    S: { width: 160, height: shape.value === 'rect16_9' ? 90 : 160 },
    M: { width: 240, height: shape.value === 'rect16_9' ? 135 : 240 },
    L: { width: 340, height: shape.value === 'rect16_9' ? 191 : 340 },
    fullscreen: { width: 560, height: 315 },
  };
  return map[size.value];
});

// Shape classes
const shapeClass = computed(() => {
  switch (shape.value) {
    case 'circle':
      return 'rounded-full';
    case 'squircle':
      return 'rounded-[38px]';
    case 'rect16_9':
      return 'rounded-2xl';
    default:
      return 'rounded-full';
  }
});

// Audio-reactive speaking halo
const haloStyle = computed(() => {
  const intensity = Math.min(1, Math.max(0, props.audioVolume * 1.5));
  const haloColor = props.isRecording
    ? `rgba(239, 68, 68, ${0.25 + intensity * 0.6})`
    : `rgba(16, 185, 129, ${0.25 + intensity * 0.6})`;
  const spread = 4 + intensity * 10;
  return {
    width: `${dimensions.value.width}px`,
    height: `${dimensions.value.height}px`,
    boxShadow: `0 0 0 ${spread}px ${haloColor}, 0 25px 50px -12px rgba(0, 0, 0, 0.75)`,
  };
});

function toggleBgMode() {
  if (bgMode.value === 'off') {
    bgMode.value = 'transparent';
  } else if (bgMode.value === 'transparent') {
    bgMode.value = 'blur';
  } else {
    bgMode.value = 'off';
  }
}
</script>

<template>
  <div
    v-if="!isHidden"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    :style="haloStyle"
    class="relative select-none overflow-hidden transition-all duration-300 border-2 bg-studio-slate"
    :class="[
      isRecording ? 'border-studio-crimson/80' : 'border-white/20',
      shapeClass
    ]"
  >
    <!-- Camera Video Feed -->
    <video
      v-if="hasCameraStream"
      ref="videoRef"
      autoplay
      muted
      playsinline
      class="w-full h-full object-cover pointer-events-none transition-transform duration-300"
      :class="[
        isMirrored ? 'scale-x-[-1]' : '',
        bgMode === 'blur' ? 'backdrop-blur-md' : ''
      ]"
    />

    <!-- Fallback Avatar when camera is disabled / off -->
    <div
      v-else
      class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-indigo-950 text-white relative"
    >
      <div class="w-16 h-16 rounded-full bg-studio-indigo/30 border border-studio-indigo/50 flex items-center justify-center shadow-inner">
        <User class="w-8 h-8 text-indigo-300" />
      </div>
      <span class="text-[11px] font-medium text-gray-300 mt-2">Presenter</span>
      <span
        v-if="isRecording"
        class="absolute bottom-2 px-2 py-0.5 rounded text-[9px] font-mono bg-red-600/80 text-white"
      >
        REC (Clean Screen)
      </span>
    </div>

    <!-- AI Cutout Badge -->
    <div
      v-if="bgMode === 'transparent'"
      class="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-indigo-900/80 border border-indigo-400/30 text-[9px] font-medium text-indigo-200 flex items-center space-x-1 backdrop-blur-md"
    >
      <Sparkles class="w-2.5 h-2.5 text-indigo-300" />
      <span>AI Cutout</span>
    </div>

    <!-- Satellite Hover Palette -->
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isHovered"
        class="absolute inset-0 bg-black/65 backdrop-blur-sm z-20 flex flex-col justify-between p-2.5 text-white"
      >
        <!-- Top Bar: Shape Switcher & Hide -->
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-1 bg-black/40 p-0.5 rounded-lg border border-white/10">
            <button
              @click="shape = 'circle'"
              class="p-1 rounded transition-colors"
              :class="shape === 'circle' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'"
              title="Circle Shape"
            >
              <Circle class="w-3.5 h-3.5" />
            </button>
            <button
              @click="shape = 'squircle'"
              class="p-1 rounded transition-colors"
              :class="shape === 'squircle' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'"
              title="Squircle Shape"
            >
              <Square class="w-3.5 h-3.5" />
            </button>
            <button
              @click="shape = 'rect16_9'"
              class="p-1 rounded transition-colors"
              :class="shape === 'rect16_9' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'"
              title="16:9 Widescreen Shape"
            >
              <RectangleHorizontal class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Hide Button -->
          <button
            @click="emit('hide')"
            class="p-1.5 rounded-lg bg-black/40 hover:bg-studio-crimson/50 text-gray-300 hover:text-white border border-white/10 transition-colors"
            title="Hide Preview (Camera continues recording in background! Ctrl+Shift+H to restore)"
          >
            <EyeOff class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Center Controls: Flip & AI Cutout -->
        <div class="flex items-center justify-center space-x-2">
          <button
            @click="isMirrored = !isMirrored"
            class="px-2 py-1 rounded-lg text-xs font-medium border flex items-center space-x-1 transition-colors"
            :class="isMirrored ? 'bg-white/20 border-white/30 text-white' : 'bg-black/40 border-white/10 text-gray-400 hover:text-white'"
            title="Flip Webcam Horizontally"
          >
            <FlipHorizontal class="w-3.5 h-3.5" />
            <span>Mirror</span>
          </button>

          <button
            @click="toggleBgMode"
            class="px-2 py-1 rounded-lg text-xs font-medium border flex items-center space-x-1 transition-colors"
            :class="bgMode !== 'off' ? 'bg-studio-indigo border-indigo-400/40 text-white shadow-lg shadow-indigo-500/30' : 'bg-black/40 border-white/10 text-gray-400 hover:text-white'"
            title="Toggle Live AI Background Removal"
          >
            <Sparkles class="w-3.5 h-3.5" />
            <span>{{ bgMode === 'off' ? 'Cutout' : bgMode === 'transparent' ? 'Cutout ON' : 'Blur ON' }}</span>
          </button>
        </div>

        <!-- Bottom Bar: Size Presets -->
        <div class="flex items-center justify-center space-x-1.5 bg-black/40 p-1 rounded-lg border border-white/10 self-center">
          <button
            v-for="s in (['S', 'M', 'L', 'fullscreen'] as CameraSize[])"
            :key="s"
            @click="size = s"
            class="px-2 py-0.5 rounded text-[11px] font-semibold transition-all"
            :class="size === s ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'"
          >
            <Maximize2 v-if="s === 'fullscreen'" class="w-3 h-3" />
            <span v-else>{{ s }}</span>
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
