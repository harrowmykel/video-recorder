<script setup lang="ts">
import { shallowRef, ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { RecordingState } from '../../types/studio';
import { invokeCommand, moveOverlayWindow, resizeOverlayWindow } from '../../lib/tauriBridge';
import { useTheme } from '../../composables/useTheme';

// Theme Variants
import ObsidianToolbar from './variants/ObsidianToolbar.vue';
import SpatialToolbar from './variants/SpatialToolbar.vue';
import GraphiteToolbar from './variants/GraphiteToolbar.vue';
import NordicToolbar from './variants/NordicToolbar.vue';

// Theme Settings Modal
import ThemeSelectorModal from '../settings/ThemeSelectorModal.vue';

const recordingState = defineModel<RecordingState>('recordingState', { required: true });

const props = defineProps<{
  isCameraHidden: boolean;
  isDockedToCamera: boolean;
  isAnnotationActive: boolean;
  isLiveZoomActive: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggleCamera'): void;
  (e: 'toggleDock'): void;
  (e: 'toggleAnnotation'): void;
  (e: 'toggleLiveZoom'): void;
}>();

const { currentTheme, initTheme } = useTheme();

const elapsedSeconds = shallowRef(0);
const isMicMuted = shallowRef(false);
const isSysAudioMuted = shallowRef(false);
const isCollapsed = shallowRef(false);
const audioLevel = shallowRef(0.4);
const isSettingsOpen = ref(false);

let timerInterval: ReturnType<typeof setInterval> | null = null;
let vuInterval: ReturnType<typeof setInterval> | null = null;

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
  moveOverlayWindow('toolbar', dx, dy);
}

function onDragMouseUp() {
  isDraggingWindow = false;
  window.removeEventListener('mousemove', onDragMouseMove);
  window.removeEventListener('mouseup', onDragMouseUp);
}

watch([isCollapsed, recordingState], ([collapsed, state]) => {
  if (collapsed && (state === 'recording' || state === 'paused')) {
    resizeOverlayWindow('toolbar', 160, 60);
  } else {
    resizeOverlayWindow('toolbar', 640, 84);
  }
});

// Timer during recording
watch(
  recordingState,
  (state) => {
    if (state === 'recording') {
      if (!timerInterval) {
        timerInterval = setInterval(() => {
          elapsedSeconds.value++;
        }, 1000);
      }
    } else if (state === 'idle') {
      elapsedSeconds.value = 0;
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    } else if (state === 'paused') {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }
  },
  { immediate: true }
);

// Audio VU simulation
onMounted(() => {
  initTheme();
  vuInterval = setInterval(() => {
    if (isMicMuted.value || recordingState.value === 'idle') {
      audioLevel.value = 0;
    } else {
      audioLevel.value = 0.35 + Math.random() * 0.45;
    }
  }, 100);
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
  if (vuInterval) clearInterval(vuInterval);
  onDragMouseUp();
});

const formattedTime = computed(() => {
  const m = Math.floor(elapsedSeconds.value / 60);
  const s = elapsedSeconds.value % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
});

function handleStart() {
  recordingState.value = 'countdown';
}

function handlePause() {
  recordingState.value = 'paused';
}

function handleResume() {
  recordingState.value = 'recording';
}

async function handleStop() {
  recordingState.value = 'review';
  await invokeCommand('stop_recording');
}

// Dynamic Component resolution for active theme
const activeToolbarVariant = computed(() => {
  switch (currentTheme.value) {
    case 'spatial':
      return SpatialToolbar;
    case 'graphite':
      return GraphiteToolbar;
    case 'nordic':
      return NordicToolbar;
    case 'obsidian':
    default:
      return ObsidianToolbar;
  }
});
</script>

<template>
  <div class="relative font-sans select-none">
    <!-- Render the active theme template -->
    <component
      :is="activeToolbarVariant"
      :recording-state="recordingState"
      :elapsed-seconds="elapsedSeconds"
      :formatted-time="formattedTime"
      :is-camera-hidden="props.isCameraHidden"
      :is-mic-muted="isMicMuted"
      :is-sys-audio-muted="isSysAudioMuted"
      :is-annotation-active="props.isAnnotationActive"
      :is-live-zoom-active="props.isLiveZoomActive"
      :is-docked-to-camera="props.isDockedToCamera"
      :is-collapsed="isCollapsed"
      :audio-level="audioLevel"
      @start-record="handleStart"
      @stop-record="handleStop"
      @pause-record="handlePause"
      @resume-record="handleResume"
      @toggle-camera="emit('toggleCamera')"
      @toggle-mic="isMicMuted = !isMicMuted"
      @toggle-sys-audio="isSysAudioMuted = !isSysAudioMuted"
      @toggle-annotation="emit('toggleAnnotation')"
      @toggle-live-zoom="emit('toggleLiveZoom')"
      @toggle-dock="emit('toggleDock')"
      @toggle-collapse="isCollapsed = !isCollapsed"
      @open-settings="isSettingsOpen = true"
      @drag-mouse-down="onDragMouseDown"
    />

    <!-- Theme Settings Modal -->
    <ThemeSelectorModal
      :is-open="isSettingsOpen"
      @close="isSettingsOpen = false"
    />
  </div>
</template>
