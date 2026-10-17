<script setup lang="ts">
import { shallowRef, computed, watch, onMounted, onUnmounted, useTemplateRef, nextTick } from 'vue';
import type { CameraShape, CameraSize } from '../../types/studio';
import { moveOverlayWindow, resizeOverlayWindow, uploadRecordedCameraTrack } from '../../lib/tauriBridge';
import { useTheme } from '../../composables/useTheme';
import { useStudioState } from '../../composables/useStudioState';
import { useBackgroundSegmentation } from '../../composables/useBackgroundSegmentation';

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
const {
  selectedCameraId,
  cameraShape: shape,
  cameraSize: size,
  cameraCustomDiameter: customDiameter,
  isCameraMirrored: isMirrored,
  bgMode,
  bgImageUrl,
  bgGradient,
  setCustomBgImageFromFile,
  cycleBgMode,
} = useStudioState();

const hasCameraStream = shallowRef(false);
const isHovered = shallowRef(false);
const isResizing = shallowRef(false);
const videoRef = useTemplateRef<HTMLVideoElement>('videoRef');
const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');
const bgFileInput = useTemplateRef<HTMLInputElement>('bgFileInput');

let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

const { startSegmentationLoop, stopSegmentationLoop } = useBackgroundSegmentation({
  videoRef,
  canvasRef,
  bgMode,
  bgImageUrl,
  bgGradient,
  isMirrored,
  hasCameraStream,
});

async function startCameraStream(deviceId?: string) {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    hasCameraStream.value = false;
    return;
  }
  try {
    const videoConstraint =
      deviceId && deviceId !== 'default' && !deviceId.startsWith('/dev/video')
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };

    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraint,
      audio: false,
    });
    hasCameraStream.value = true;
    await nextTick();
    if (videoRef.value && mediaStream) {
      videoRef.value.srcObject = mediaStream;
      await videoRef.value.play().catch(() => {});
    }
  } catch (err) {
    console.log('Webcam stream fallback active:', err);
    hasCameraStream.value = false;
  }
}

// Switch camera stream in real time when selectedCameraId changes
watch(selectedCameraId, (newId) => {
  startCameraStream(newId);
});

// Record composited canvas stream when recording starts, and upload on stop
watch(
  () => props.isRecording,
  (rec) => {
    if (rec) {
      startCanvasRecording();
    } else {
      stopCanvasRecording();
    }
  }
);

function startCanvasRecording() {
  if (!canvasRef.value || typeof MediaRecorder === 'undefined') return;
  try {
    recordedChunks = [];
    const stream = canvasRef.value.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        recordedChunks.push(ev.data);
      }
    };
    mediaRecorder.onstop = async () => {
      if (recordedChunks.length > 0) {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        await uploadRecordedCameraTrack(blob);
      }
      recordedChunks = [];
    };
    mediaRecorder.start(500);
  } catch (err) {
    console.warn('[CameraBubble] MediaRecorder start failed:', err);
  }
}

function stopCanvasRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch {}
  }
  mediaRecorder = null;
}

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

function handleSetShape(newShape: CameraShape) {
  shape.value = newShape;
}

async function handleCustomBgUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    await setCustomBgImageFromFile(file);
  }
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
  await startCameraStream(selectedCameraId.value);
  startSegmentationLoop();
});

onUnmounted(() => {
  stopSegmentationLoop();
  stopCanvasRecording();
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
  }
  onDragMouseUp();
  onResizeMouseUp();
});

const dimensions = computed(() => {
  if (customDiameter.value !== null) {
    return {
      width: customDiameter.value,
      height: shape.value === 'rect16_9' ? Math.round((customDiameter.value * 9) / 16) : customDiameter.value,
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
    resizeOverlayWindow('camera', Math.max(width + 36, 260), height + 84);
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
    <input
      ref="bgFileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleCustomBgUpload"
    />

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
      @set-shape="handleSetShape"
      @set-size="handleSetSize"
      @toggle-mirror="isMirrored = !isMirrored"
      @toggle-bg-mode="cycleBgMode"
      @upload-bg-image="bgFileInput?.click()"
      @hide="emit('hide')"
      @drag-mouse-down="onDragMouseDown"
      @start-resize="onResizeMouseDown"
      @wheel-resize="onWheelResize"
    >
      <template #video>
        <!-- Hidden raw <video> source used by real-time canvas segmentation pipeline -->
        <video
          ref="videoRef"
          autoplay
          muted
          playsinline
          class="hidden"
        />
        <!-- Live Segmented & Background-Composited Output Canvas -->
        <canvas
          ref="canvasRef"
          :width="dimensions.width * 2"
          :height="dimensions.height * 2"
          class="w-full h-full object-cover pointer-events-none"
        />
      </template>
    </component>
  </div>
</template>
