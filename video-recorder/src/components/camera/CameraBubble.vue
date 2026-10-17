<script setup lang="ts">
import { shallowRef, computed, watch, onMounted, onUnmounted, useTemplateRef, nextTick } from 'vue';
import {
  FlipHorizontal,
  Sparkles,
  EyeOff,
  Maximize2,
  Circle,
  Square,
  RectangleHorizontal,
  User,
  Radio
} from 'lucide-vue-next';
import { CameraShape, CameraSize, BgRemovalMode } from '../../types/studio';
import { moveOverlayWindow, resizeOverlayWindow } from '../../lib/tauriBridge';

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

const shape = shallowRef<CameraShape>('circle');
const size = shallowRef<CameraSize>('M');
const isMirrored = shallowRef(true);
const bgMode = shallowRef<BgRemovalMode>('off');
const hasCameraStream = shallowRef(false);
const isHovered = shallowRef(false);
const videoRef = useTemplateRef<HTMLVideoElement>('videoRef');

let mediaStream: MediaStream | null = null;

// Native OS window pointer dragging
let isDraggingWindow = false;
let lastScreenX = 0;
let lastScreenY = 0;

function onDragMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (target?.closest('button, input, select, a')) return;
  isDraggingWindow = true;
  lastScreenX = e.screenX;
  lastScreenY = e.screenY;
  window.addEventListener('mousemove', onDragMouseMove);
  window.addEventListener('mouseup', onDragMouseUp);
}

function onDragMouseMove(e: MouseEvent) {
  if (!isDraggingWindow) return;
  const dx = e.screenX - lastScreenX;
  const dy = e.screenY - lastScreenY;
  lastScreenX = e.screenX;
  lastScreenY = e.screenY;
  moveOverlayWindow('camera', dx, dy);
}

function onDragMouseUp() {
  isDraggingWindow = false;
  window.removeEventListener('mousemove', onDragMouseMove);
  window.removeEventListener('mouseup', onDragMouseUp);
}

onMounted(async () => {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: false,
    });
    hasCameraStream.value = true;
    await nextTick();
    if (videoRef.value && mediaStream) {
      videoRef.value.srcObject = mediaStream;
      videoRef.value.play().catch((err) => console.warn('Webcam video play error:', err));
    }
  } catch (err) {
    console.log('Webcam not active, using fallback avatar:', err);
    hasCameraStream.value = false;
  }
});

onUnmounted(() => {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
  }
  onDragMouseUp();
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

watch(
  dimensions,
  ({ width, height }) => {
    // Include 48px padding for speaking halo glow and shadow
    resizeOverlayWindow('camera', width + 48, height + 48);
  },
  { immediate: true }
);

// Shape classes
const shapeClass = computed(() => {
  switch (shape.value) {
    case 'circle':
      return 'rounded-full';
    case 'squircle':
      return 'rounded-[42px]';
    case 'rect16_9':
      return 'rounded-2xl';
    default:
      return 'rounded-full';
  }
});

// Audio-reactive speaking halo with multiple soft specular layers
const haloStyle = computed(() => {
  const intensity = Math.min(1, Math.max(0, props.audioVolume * 1.6));
  const haloColor = props.isRecording
    ? `rgba(255, 59, 48, ${0.3 + intensity * 0.55})`
    : `rgba(16, 185, 129, ${0.3 + intensity * 0.55})`;
  const outerSpread = 6 + intensity * 14;
  return {
    width: `${dimensions.value.width}px`,
    height: `${dimensions.value.height}px`,
    boxShadow: `
      0 0 0 1px rgba(255, 255, 255, 0.15) inset,
      0 0 0 ${outerSpread}px ${haloColor},
      0 30px 60px -12px rgba(0, 0, 0, 0.85)
    `,
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
    @mousedown="onDragMouseDown"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    :style="haloStyle"
    class="relative select-none overflow-hidden transition-all duration-300 border border-white/20 bg-studio-surface group cursor-grab active:cursor-grabbing"
    :class="[
      isRecording ? 'border-red-500/80' : 'border-white/20',
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

    <!-- Studio Presenter Avatar Fallback with Ambient Glow -->
    <div
      v-else
      class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1C1F2E] via-[#12141F] to-[#0A0C14] text-white relative overflow-hidden"
    >
      <!-- Ambient Backlight -->
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(99,102,241,0.25),transparent_70%)]" />

      <div class="relative w-16 h-16 rounded-full bg-gradient-to-b from-indigo-500/30 to-violet-600/10 border border-indigo-400/40 flex items-center justify-center shadow-[0_0_24px_rgba(99,102,241,0.25)]">
        <User class="w-8 h-8 text-indigo-200" />
        <span class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-studio-dark shadow-[0_0_8px_#10B981]" />
      </div>

      <span class="relative text-xs font-semibold tracking-wide text-gray-200 mt-2.5">
        Presenter Camera
      </span>
      <span class="relative text-[10px] font-mono text-gray-400">
        {{ isRecording ? 'Decoupled RAW Recording' : 'Standby' }}
      </span>

      <span
        v-if="isRecording"
        class="absolute bottom-3 px-2 py-0.5 rounded-md text-[9px] font-mono font-medium tracking-wider bg-red-500/20 text-red-300 border border-red-500/30 flex items-center space-x-1"
      >
        <Radio class="w-2.5 h-2.5 animate-pulse text-red-400" />
        <span>ISOLATED FEED</span>
      </span>
    </div>

    <!-- AI Cutout Badge -->
    <div
      v-if="bgMode === 'transparent'"
      class="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full bg-indigo-950/80 border border-indigo-400/30 text-[10px] font-semibold text-indigo-200 flex items-center space-x-1.5 backdrop-blur-md shadow-lg"
    >
      <Sparkles class="w-3 h-3 text-indigo-300" />
      <span>AI Cutout Active</span>
    </div>

    <!-- Satellite Hover Palette (Ultra-Sleek) -->
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
        class="absolute inset-0 bg-black/75 backdrop-blur-md z-20 flex flex-col justify-between p-3 text-white"
      >
        <!-- Top Bar: Shape Switcher & Hide -->
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-1 bg-white/10 p-1 rounded-xl border border-white/10 shadow-inner">
            <button
              @click="shape = 'circle'"
              class="p-1 rounded-lg transition-all"
              :class="shape === 'circle' ? 'bg-white/20 text-white shadow' : 'text-gray-400 hover:text-white'"
              title="Circle Shape"
            >
              <Circle class="w-3.5 h-3.5" />
            </button>
            <button
              @click="shape = 'squircle'"
              class="p-1 rounded-lg transition-all"
              :class="shape === 'squircle' ? 'bg-white/20 text-white shadow' : 'text-gray-400 hover:text-white'"
              title="Squircle Shape"
            >
              <Square class="w-3.5 h-3.5" />
            </button>
            <button
              @click="shape = 'rect16_9'"
              class="p-1 rounded-lg transition-all"
              :class="shape === 'rect16_9' ? 'bg-white/20 text-white shadow' : 'text-gray-400 hover:text-white'"
              title="16:9 Widescreen Shape"
            >
              <RectangleHorizontal class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Hide Button -->
          <button
            @click="emit('hide')"
            class="p-2 rounded-xl bg-white/10 hover:bg-red-500/30 text-gray-300 hover:text-red-200 border border-white/10 transition-colors shadow-sm"
            title="Hide Preview (Camera continues recording in background! Ctrl+Shift+H to restore)"
          >
            <EyeOff class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Center Controls: Flip & AI Cutout -->
        <div class="flex items-center justify-center space-x-2">
          <button
            @click="isMirrored = !isMirrored"
            class="px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center space-x-1.5 transition-all shadow-sm"
            :class="isMirrored ? 'bg-white/20 border-white/30 text-white shadow-inner' : 'bg-black/40 border-white/10 text-gray-300 hover:text-white'"
            title="Flip Webcam Horizontally"
          >
            <FlipHorizontal class="w-3.5 h-3.5" />
            <span>Mirror</span>
          </button>

          <button
            @click="toggleBgMode"
            class="px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center space-x-1.5 transition-all"
            :class="bgMode !== 'off' ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)]' : 'bg-black/40 border-white/10 text-gray-300 hover:text-white'"
            title="Toggle Live AI Background Removal"
          >
            <Sparkles class="w-3.5 h-3.5" />
            <span>{{ bgMode === 'off' ? 'Cutout' : bgMode === 'transparent' ? 'Cutout ON' : 'Blur ON' }}</span>
          </button>
        </div>

        <!-- Bottom Bar: Size Presets -->
        <div class="flex items-center justify-center space-x-1 bg-white/10 p-1 rounded-xl border border-white/10 self-center shadow-inner">
          <button
            v-for="s in (['S', 'M', 'L', 'fullscreen'] as CameraSize[])"
            :key="s"
            @click="size = s"
            class="px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-all"
            :class="size === s ? 'bg-white text-black shadow-md scale-105' : 'text-gray-400 hover:text-white'"
          >
            <Maximize2 v-if="s === 'fullscreen'" class="w-3 h-3" />
            <span v-else>{{ s }}</span>
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
