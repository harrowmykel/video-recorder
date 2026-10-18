<script setup lang="ts">
import { shallowRef, computed, watch, onMounted, onUnmounted, useTemplateRef, nextTick } from 'vue';
import type { CameraShape, CameraSize } from '@/types/studio';
import {
  moveOverlayWindow,
  resizeOverlayWindow,
  uploadRecordedCameraTrack,
  uploadCameraChunk,
  broadcastEvent,
} from '@/lib/tauriBridge';

import { useTheme } from '@/composables/useTheme';
import { useStudioState } from '@/composables/useStudioState';
import { useBackgroundSegmentation } from '@/composables/useBackgroundSegmentation';

// Theme Variants
import ObsidianCamera from '@/components/camera/variants/ObsidianCamera.vue';
import SpatialCamera from '@/components/camera/variants/SpatialCamera.vue';
import GraphiteCamera from '@/components/camera/variants/GraphiteCamera.vue';
import NordicCamera from '@/components/camera/variants/NordicCamera.vue';

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
  recordingState,
  selectedCameraId,
  cameraShape: shape,
  cameraSize: size,
  cameraCustomDiameter: customDiameter,
  isCameraMirrored: isMirrored,
  bgMode,
  bgImageUrl,
  bgGradient,
  lastRecordedSession,
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
  if (videoRef.value) {
    videoRef.value.srcObject = null;
  }
  if (!deviceId || deviceId === 'none') {
    hasCameraStream.value = false;
    return;
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
  if (newId === 'none') {
    stopCanvasRecording();
  }
  startCameraStream(newId);
});

// Record composited canvas stream across recording/pause/resume and upload on stop
watch(
  [() => props.isRecording, recordingState, selectedCameraId],
  ([recProp, state, camId]) => {
    if (camId === 'none') {
      stopCanvasRecording();
      return;
    }

    const isActivelyRecording = state === 'recording' || recProp;
    const isPaused = state === 'paused';

    if (isPaused) {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        try {
          mediaRecorder.pause();
        } catch {}
      }
      return;
    }

    if (isActivelyRecording) {
      if (!hasCameraStream.value) {
        startCameraStream(camId);
      }
      if (mediaRecorder && mediaRecorder.state === 'paused') {
        try {
          mediaRecorder.resume();
        } catch {}
      } else if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        startCanvasRecording();
      }
    } else {
      stopCanvasRecording();
    }
  }
);

watch(recordingState, (state) => {
  if (state === 'idle') {
    recordingStartEpoch = 0;
    chunkIndex = 1;
  }
});

function resolveSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c));
}

let currentChunkBlobs: Blob[] = [];
let chunkIndex = 1;
let recordingStartEpoch = 0;
let chunkStartEpoch = 0;
let chunkIntervalTimer: ReturnType<typeof setInterval> | null = null;
let chunkKeyframes: Array<{ offset_ms: number; x: number; y: number; norm_x: number; norm_y: number }> = [];

async function flushCurrentChunk() {
  if (currentChunkBlobs.length === 0) return;
  const mimeType = resolveSupportedMimeType() || 'video/webm';
  const chunkBlob = new Blob(currentChunkBlobs, { type: mimeType });
  currentChunkBlobs = [];

  const now = Date.now();
  const startMs = Math.max(0, chunkStartEpoch - recordingStartEpoch);
  const endMs = Math.max(startMs + 100, now - recordingStartEpoch);
  const durationMs = endMs - startMs;
  chunkStartEpoch = now;

  const screenW = typeof window !== 'undefined' && window.screen?.width ? window.screen.width : 1920;
  const screenH = typeof window !== 'undefined' && window.screen?.height ? window.screen.height : 1080;
  const curX = typeof window !== 'undefined' ? window.screenX || 1520 : 1520;
  const curY = typeof window !== 'undefined' ? window.screenY || 780 : 780;

  const metadata = {
    chunk_id: `camera_chunk_${String(chunkIndex).padStart(4, '0')}`,
    start_ms: startMs,
    end_ms: endMs,
    duration_ms: durationMs,
    type: 'camera',
    is_hidden: props.isHidden,
    is_mirrored: Boolean(isMirrored.value),
    position: {
      x: curX,
      y: curY,
      norm_x: Number((curX / screenW).toFixed(4)),
      norm_y: Number((curY / screenH).toFixed(4)),
    },
    bubble: {
      shape: shape.value,
      size_preset: size.value,
      width: dimensions.value.width,
      height: dimensions.value.height,
      custom_diameter: customDiameter.value,
    },
    segmentation: {
      bg_mode: bgMode.value,
      model: 'mediapipe_fast',
      custom_image: bgImageUrl.value || null,
    },
    telemetry_keyframes: [...chunkKeyframes],
  };
  chunkKeyframes = [];

  const thisIdx = chunkIndex;
  chunkIndex++;
  await uploadCameraChunk(chunkBlob, thisIdx, metadata);
}

function startCanvasRecording() {
  if (selectedCameraId.value === 'none') return;
  if (!canvasRef.value || typeof MediaRecorder === 'undefined') return;
  try {
    recordedChunks = [];
    currentChunkBlobs = [];
    if (!recordingStartEpoch) {
      recordingStartEpoch = Date.now();
      chunkIndex = 1;
    }
    chunkStartEpoch = Date.now();
    chunkKeyframes = [];

    const stream = canvasRef.value.captureStream(30);
    const mimeType = resolveSupportedMimeType();
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        recordedChunks.push(ev.data);
        currentChunkBlobs.push(ev.data);
      }
    };
    mediaRecorder.onstop = async () => {
      if (chunkIntervalTimer) {
        clearInterval(chunkIntervalTimer);
        chunkIntervalTimer = null;
      }
      if (currentChunkBlobs.length > 0) {
        await flushCurrentChunk();
      }
      if (recordedChunks.length > 0) {
        const blob = new Blob(recordedChunks, { type: mimeType || 'video/webm' });
        const uploadedPath = await uploadRecordedCameraTrack(blob);
        const ts = Date.now();
        if (lastRecordedSession.value) {
          const baseCamUrl = (lastRecordedSession.value.cameraUrl || '').replace(/\?t=\d+$/, '');
          if (baseCamUrl) {
            lastRecordedSession.value = {
              ...lastRecordedSession.value,
              cameraUrl: `${baseCamUrl}?t=${ts}`,
            };
          }
        }
        broadcastEvent('camera_track_uploaded', {
          cameraPath: uploadedPath,
          timestamp: ts,
        });
      }
      recordedChunks = [];
      currentChunkBlobs = [];
    };
    mediaRecorder.start(250);

    // 15-second chunk timer
    chunkIntervalTimer = setInterval(async () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        try {
          mediaRecorder.requestData();
        } catch {}
        await flushCurrentChunk();
      }
    }, 15000);
  } catch (err) {
    console.warn('[CameraBubble] MediaRecorder start failed:', err);
  }
}

function stopCanvasRecording() {
  if (chunkIntervalTimer) {
    clearInterval(chunkIntervalTimer);
    chunkIntervalTimer = null;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.requestData();
    } catch {}
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

function nextShape(): CameraShape {
  if (shape.value === 'circle') return 'squircle';
  if (shape.value === 'squircle') return 'rect16_9';
  return 'circle';
}

function handleSetShape() {
  shape.value = nextShape();
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

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    const screenW = typeof window !== 'undefined' && window.screen?.width ? window.screen.width : 1920;
    const screenH = typeof window !== 'undefined' && window.screen?.height ? window.screen.height : 1080;
    chunkKeyframes.push({
      offset_ms: Math.max(0, Date.now() - chunkStartEpoch),
      x: e.screenX,
      y: e.screenY,
      norm_x: Number((e.screenX / screenW).toFixed(4)),
      norm_y: Number((e.screenY / screenH).toFixed(4)),
    });
  }
}


function onDragMouseUp() {
  isDraggingWindow = false;
  window.removeEventListener('mousemove', onDragMouseMove);
  window.removeEventListener('mouseup', onDragMouseUp);
}

onMounted(async () => {
  initTheme();
  if (selectedCameraId.value !== 'none') {
    await startCameraStream(selectedCameraId.value);
  } else {
    hasCameraStream.value = false;
  }
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
    v-show="!isHidden && selectedCameraId !== 'none'"
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
