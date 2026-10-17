<script setup lang="ts">
import { shallowRef, computed, watch, onMounted, onUnmounted, useTemplateRef, nextTick } from 'vue';
import { CameraShape, CameraSize, BgRemovalMode } from '../../types/studio';
import { moveOverlayWindow, resizeOverlayWindow } from '../../lib/tauriBridge';
import { useTheme } from '../../composables/useTheme';

// Theme Variants
import ObsidianCamera from './variants/ObsidianCamera.vue';
import SpatialCamera from './variants/SpatialCamera.vue';
import GraphiteCamera from './variants/GraphiteCamera.vue';
import NordicCamera from './variants/NordicCamera.vue';

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

const { currentTheme, initTheme } = useTheme();

const shape = shallowRef<CameraShape>('circle');
const size = shallowRef<CameraSize>('M');
const isMirrored = shallowRef(true);
const bgMode = shallowRef<BgRemovalMode>('off');
const hasCameraStream = shallowRef(false);
const isHovered = shallowRef(false);
const videoRef = useTemplateRef<HTMLVideoElement>('videoRef');

let mediaStream: MediaStream | null = null;

const customDiameter = shallowRef<number | null>(null);
const isResizing = shallowRef(false);

let resizeStartScreenX = 0;
let resizeStartScreenY = 0;
let resizeStartDiameter = 240;

function onResizeMouseDown(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  isResizing.value = true;
  resizeStartScreenX = e.screenX;
  resizeStartScreenY = e.screenY;
  resizeStartDiameter = dimensions.value.width;

  window.addEventListener('mousemove', onResizeMouseMove);
  window.addEventListener('mouseup', onResizeMouseUp);
}

function onResizeMouseMove(e: MouseEvent) {
  if (!isResizing.value) return;
  const deltaX = e.screenX - resizeStartScreenX;
  const deltaY = e.screenY - resizeStartScreenY;
  const delta = (deltaX + deltaY) / 2;
  const newDiameter = Math.round(resizeStartDiameter + delta * 2);
  customDiameter.value = Math.min(640, Math.max(120, newDiameter));
}

function onResizeMouseUp() {
  if (!isResizing.value) return;
  isResizing.value = false;
  window.removeEventListener('mousemove', onResizeMouseMove);
  window.removeEventListener('mouseup', onResizeMouseUp);
}

function onWheelResize(e: WheelEvent) {
  const current = customDiameter.value ?? dimensions.value.width;
  const step = e.deltaY < 0 ? 16 : -16;
  customDiameter.value = Math.min(640, Math.max(120, current + step));
}

function handleSetSize(newSize: CameraSize) {
  customDiameter.value = null;
  size.value = newSize;
}

// Native OS window pointer dragging
let isDraggingWindow = false;
let lastScreenX = 0;
let lastScreenY = 0;

function onDragMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (target?.closest('button, input, select, a, [data-resize-handle]')) return;
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
  initTheme();
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
  onResizeMouseUp();
});

// Size dimensions
const dimensions = computed(() => {
  if (customDiameter.value !== null) {
    return {
      width: customDiameter.value,
      height: shape.value === 'rect16_9' ? Math.round(customDiameter.value * 9 / 16) : customDiameter.value,
    };
  }
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
    // Accommodate speaking glow halo on top/sides and the floating toolbar beneath the circle
    resizeOverlayWindow('camera', Math.max(width + 32, 240), height + 80);
  },
  { immediate: true }
);

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

// Audio-reactive speaking halo ring
const haloStyle = computed(() => {
  const intensity = Math.min(1, Math.max(0, props.audioVolume * 1.5));
  let haloColor = props.isRecording
    ? `rgba(244, 63, 94, ${0.4 + intensity * 0.5})`
    : `rgba(16, 185, 129, ${0.4 + intensity * 0.5})`;

  if (currentTheme.value === 'spatial') {
    haloColor = props.isRecording
      ? `rgba(244, 63, 94, ${0.4 + intensity * 0.5})`
      : `rgba(56, 189, 248, ${0.4 + intensity * 0.5})`;
  } else if (currentTheme.value === 'graphite') {
    haloColor = props.isRecording
      ? `rgba(255, 42, 42, ${0.5 + intensity * 0.5})`
      : `rgba(255, 85, 0, ${0.4 + intensity * 0.5})`;
  }

  const outerSpread = 3 + intensity * 8;
  return {
    width: `${dimensions.value.width}px`,
    height: `${dimensions.value.height}px`,
    boxShadow: `
      0 0 0 1px rgba(255, 255, 255, 0.2) inset,
      0 0 0 ${outerSpread}px ${haloColor},
      0 20px 40px -10px rgba(0, 0, 0, 0.8)
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

// Active camera variant component
const activeCameraVariant = computed(() => {
  switch (currentTheme.value) {
    case 'spatial':
      return SpatialCamera;
    case 'graphite':
      return GraphiteCamera;
    case 'nordic':
      return NordicCamera;
    case 'obsidian':
    default:
      return ObsidianCamera;
  }
});
</script>

<template>
  <div
    v-if="!isHidden"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    class="relative select-none flex flex-col items-center group"
  >
    <component
      :is="activeCameraVariant"
      :has-camera-stream="hasCameraStream"
      :is-mirrored="isMirrored"
      :bg-mode="bgMode"
      :shape="shape"
      :size="size"
      :custom-diameter="customDiameter"
      :is-resizing="isResizing"
      :is-recording="isRecording"
      :is-hovered="isHovered"
      :shape-class="shapeClass"
      :halo-style="haloStyle"
      @set-shape="shape = $event"
      @set-size="handleSetSize"
      @toggle-mirror="isMirrored = !isMirrored"
      @toggle-bg-mode="toggleBgMode"
      @hide="emit('hide')"
      @drag-mouse-down="onDragMouseDown"
      @start-resize="onResizeMouseDown"
      @wheel-resize="onWheelResize"
    >
      <template #video>
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
      </template>
    </component>
  </div>
</template>
