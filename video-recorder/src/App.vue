<script setup lang="ts">
import { shallowRef, ref, onMounted, onUnmounted, watch } from 'vue';
import FloatingToolbar from './components/toolbar/FloatingToolbar.vue';
import CameraBubble from './components/camera/CameraBubble.vue';
import CountdownOverlay from './components/countdown/CountdownOverlay.vue';
import AnnotationCanvas from './components/annotations/AnnotationCanvas.vue';
import StudioReviewModal from './components/studio/StudioReviewModal.vue';
import ThemeSelectorModal from './components/settings/ThemeSelectorModal.vue';
import { useTheme } from './composables/useTheme';
import { RecordingState } from './types/studio';
import { invokeCommand, broadcastEvent, subscribeToEvent } from './lib/tauriBridge';
import {
  Wifi,
  BatteryCharging,
  Palette
} from 'lucide-vue-next';

const { currentTheme, themeMeta, initTheme } = useTheme();
const isThemeModalOpen = ref(false);

// Read window target from URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const targetWindow = shallowRef(urlParams.get('window') || 'preview-all');

// Global state
const recordingState = shallowRef<RecordingState>('idle');
const isCameraHidden = shallowRef(false);
const isDockedToCamera = shallowRef(false);
const isAnnotationActive = shallowRef(false);
const isLiveZoomActive = shallowRef(false);
const audioVolume = shallowRef(0.4);

let isSyncingFromBus = false;

function broadcastSync() {
  if (isSyncingFromBus) return;
  broadcastEvent('sync_state', {
    recordingState: recordingState.value,
    isCameraHidden: isCameraHidden.value,
    isDockedToCamera: isDockedToCamera.value,
    isAnnotationActive: isAnnotationActive.value,
    isLiveZoomActive: isLiveZoomActive.value,
  });
}

watch(
  [recordingState, isCameraHidden, isDockedToCamera, isAnnotationActive, isLiveZoomActive],
  () => {
    broadcastSync();
  }
);

// Simulated audio fluctuation for camera halo
let audioInterval: ReturnType<typeof setInterval> | null = null;
let unsubscribeSync: (() => void) | null = null;
let unsubscribeShortcut: (() => void) | null = null;

async function handleCountdownComplete() {
  recordingState.value = 'recording';
  try {
    await invokeCommand('start_recording');
  } catch (err) {
    console.warn('Failed to start recording on backend:', err);
  }
}

function handleCountdownCancel() {
  recordingState.value = 'idle';
}

function handleToggleCamera() {
  isCameraHidden.value = !isCameraHidden.value;
  invokeCommand('toggle_camera_bubble').catch(() => {});
}

function handleToggleLiveZoom() {
  isLiveZoomActive.value = !isLiveZoomActive.value;
  invokeCommand('toggle_live_zoom', { active: isLiveZoomActive.value }).catch(() => {});
}

function handleToggleAnnotation() {
  isAnnotationActive.value = !isAnnotationActive.value;
}

function handleToggleDock() {
  isDockedToCamera.value = !isDockedToCamera.value;
}

function executeShortcutAction(action: string) {
  switch (action) {
    case 'record':
      if (recordingState.value === 'idle') {
        recordingState.value = 'countdown';
      } else if (recordingState.value === 'recording' || recordingState.value === 'paused') {
        recordingState.value = 'review';
        invokeCommand('stop_recording').catch(() => {});
      }
      break;
    case 'pause':
      if (recordingState.value === 'recording') {
        recordingState.value = 'paused';
      } else if (recordingState.value === 'paused') {
        recordingState.value = 'recording';
      }
      break;
    case 'camera':
      handleToggleCamera();
      break;
    case 'zoom':
      handleToggleLiveZoom();
      break;
    case 'annotation':
      handleToggleAnnotation();
      break;
  }
}

// Global Shortcuts (Task 1.2)
function handleGlobalHotkeys(e: KeyboardEvent) {
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  if (!isCtrlOrCmd || !e.shiftKey) return;

  switch (e.code) {
    case 'KeyR':
      e.preventDefault();
      executeShortcutAction('record');
      break;
    case 'Space':
      e.preventDefault();
      executeShortcutAction('pause');
      break;
    case 'KeyH':
      e.preventDefault();
      executeShortcutAction('camera');
      break;
    case 'KeyZ':
      e.preventDefault();
      executeShortcutAction('zoom');
      break;
    case 'KeyA':
      e.preventDefault();
      executeShortcutAction('annotation');
      break;
  }
}

onMounted(() => {
  initTheme();
  audioInterval = setInterval(() => {
    if (recordingState.value === 'recording') {
      audioVolume.value = 0.25 + Math.random() * 0.55;
    } else {
      audioVolume.value = 0.15;
    }
  }, 100);

  window.addEventListener('keydown', handleGlobalHotkeys);

  // Subscribe to cross-window sync events
  unsubscribeSync = subscribeToEvent<Record<string, any>>('sync_state', (payload) => {
    isSyncingFromBus = true;
    if (payload.recordingState !== undefined) recordingState.value = payload.recordingState;
    if (payload.isCameraHidden !== undefined) isCameraHidden.value = payload.isCameraHidden;
    if (payload.isDockedToCamera !== undefined) isDockedToCamera.value = payload.isDockedToCamera;
    if (payload.isAnnotationActive !== undefined) isAnnotationActive.value = payload.isAnnotationActive;
    if (payload.isLiveZoomActive !== undefined) isLiveZoomActive.value = payload.isLiveZoomActive;
    setTimeout(() => {
      isSyncingFromBus = false;
    }, 50);
  });

  // Subscribe to OS global shortcuts routed from the desktop shell
  if (targetWindow.value === 'toolbar' || targetWindow.value === 'preview-all') {
    unsubscribeShortcut = subscribeToEvent<{ action: string }>('global_shortcut', (payload) => {
      if (payload?.action) {
        executeShortcutAction(payload.action);
      }
    });
  }
});

onUnmounted(() => {
  if (audioInterval) {
    clearInterval(audioInterval);
    audioInterval = null;
  }
  window.removeEventListener('keydown', handleGlobalHotkeys);
  if (unsubscribeSync) {
    unsubscribeSync();
    unsubscribeSync = null;
  }
  if (unsubscribeShortcut) {
    unsubscribeShortcut();
    unsubscribeShortcut = null;
  }
});
</script>

<template>
  <div class="w-screen h-screen overflow-hidden select-none font-sans bg-transparent">
    <!-- Standalone Window Modes for Native Multi-Window Desktop Overlay -->
    <template v-if="targetWindow === 'toolbar'">
      <div class="w-full h-full flex items-center justify-center">
        <FloatingToolbar
          v-model:recording-state="recordingState"
          :is-camera-hidden="isCameraHidden"
          :is-docked-to-camera="isDockedToCamera"
          :is-annotation-active="isAnnotationActive"
          :is-live-zoom-active="isLiveZoomActive"
          @toggle-camera="handleToggleCamera"
          @toggle-dock="handleToggleDock"
          @toggle-annotation="handleToggleAnnotation"
          @toggle-live-zoom="handleToggleLiveZoom"
        />
      </div>
    </template>

    <template v-else-if="targetWindow === 'camera'">
      <div class="w-full h-full flex flex-col items-center justify-start pt-3">
        <CameraBubble
          :is-hidden="isCameraHidden"
          :audio-volume="audioVolume"
          :is-recording="recordingState === 'recording'"
          @hide="handleToggleCamera"
        />
      </div>
    </template>

    <template v-else-if="targetWindow === 'annotations'">
      <AnnotationCanvas
        :is-active="isAnnotationActive"
        @close="isAnnotationActive = false"
      />
    </template>

    <template v-else-if="targetWindow === 'countdown'">
      <CountdownOverlay
        v-if="recordingState === 'countdown'"
        @complete="handleCountdownComplete"
        @cancel="handleCountdownCancel"
      />
    </template>

    <template v-else-if="targetWindow === 'studio'">
      <StudioReviewModal
        v-if="recordingState === 'review'"
        @close="recordingState = 'idle'"
      />
    </template>

    <!-- Comprehensive Interactive Workspace Preview Harness (Default Web Browser Preview) -->
    <template v-else>
      <div class="relative w-full h-full bg-[#08090E] flex flex-col justify-between overflow-hidden">
        <!-- Ambient Studio Lighting Glows -->
        <div class="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-[128px] pointer-events-none" />
        <div class="absolute -bottom-40 -right-40 w-96 h-96 bg-red-600/15 rounded-full blur-[128px] pointer-events-none" />
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),transparent_70%)] pointer-events-none" />

        <!-- Simulated OS Top System Bar -->
        <header class="z-20 px-6 py-2.5 flex items-center justify-between border-b border-white/[0.06] bg-[#0A0C14]/80 backdrop-blur-md">
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2">
              <div class="w-3 h-3 rounded-full bg-studio-crimson shadow-[0_0_8px_#FF3B30]" />
              <span class="text-xs font-bold tracking-wider text-white">STUDIO RECORDER</span>
            </div>
            <div class="h-3 w-px bg-white/10" />
            <div class="flex items-center space-x-3 text-xs text-gray-400 font-medium">
              <span class="text-white hover:text-indigo-400 transition-colors cursor-pointer">File</span>
              <span class="hover:text-white transition-colors cursor-pointer">Capture</span>
              <span class="hover:text-white transition-colors cursor-pointer">Overlays</span>
              <span class="hover:text-white transition-colors cursor-pointer">AI Studio</span>
            </div>
          </div>

          <!-- Quick Test Control Badges -->
          <div class="flex items-center space-x-3 text-xs">
            <div class="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/5 font-mono text-gray-300">
              <span class="text-gray-500">STATE:</span>
              <span class="font-semibold text-white uppercase">{{ recordingState }}</span>
            </div>

            <button
              @click="recordingState = 'review'"
              class="px-3 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-400/30 text-indigo-300 font-semibold transition-all shadow-sm active:scale-95"
            >
              Open Studio Review Modal
            </button>

            <button
              @click="isThemeModalOpen = true"
              class="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-300 font-semibold transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
            >
              <Palette class="w-3.5 h-3.5" />
              <span>Theme: {{ themeMeta[currentTheme].name }}</span>
            </button>

            <div class="flex items-center space-x-2 text-gray-400 pl-2">
              <Wifi class="w-3.5 h-3.5" />
              <BatteryCharging class="w-3.5 h-3.5 text-emerald-400" />
              <span class="font-mono text-[11px] text-gray-300">14:32</span>
            </div>
          </div>
        </header>

        <!-- Center Workspace Desktop Mockup -->
        <main class="flex-1 flex items-center justify-center relative p-8">
          <!-- Central Desktop Info Card -->
          <div class="text-center max-w-lg z-0 pointer-events-none opacity-40">
            <div class="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-gray-300 mb-3">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Clean Desktop Capture Isolated</span>
            </div>
            <h2 class="text-3xl font-extrabold text-white tracking-tight">
              Screen & Camera Studio
            </h2>
            <p class="text-xs text-gray-400 mt-2 leading-relaxed">
              The camera bubble and floating toolbar below are rendered on separate overlay layers and will not appear inside your screen recording video track.
            </p>
          </div>

          <!-- Floating Camera Bubble (Draggable preview) -->
          <div
            class="transition-all duration-300 z-10"
            :class="[
              isDockedToCamera
                ? 'flex flex-col items-center space-y-12'
                : 'absolute bottom-20 right-16'
            ]"
          >
            <CameraBubble
              :is-hidden="isCameraHidden"
              :audio-volume="audioVolume"
              :is-recording="recordingState === 'recording'"
              @hide="isCameraHidden = true"
            />

            <!-- Docked Toolbar if Satellite mode is enabled -->
            <FloatingToolbar
              v-if="isDockedToCamera"
              v-model:recording-state="recordingState"
              :is-camera-hidden="isCameraHidden"
              :is-docked-to-camera="isDockedToCamera"
              :is-annotation-active="isAnnotationActive"
              :is-live-zoom-active="isLiveZoomActive"
              @toggle-camera="handleToggleCamera"
              @toggle-dock="handleToggleDock"
              @toggle-annotation="handleToggleAnnotation"
              @toggle-live-zoom="handleToggleLiveZoom"
            />
          </div>

          <!-- Free-Floating Toolbar when not docked -->
          <div
            v-if="!isDockedToCamera"
            class="absolute bottom-10 left-1/2 -translate-x-1/2 z-30"
          >
            <FloatingToolbar
              v-model:recording-state="recordingState"
              :is-camera-hidden="isCameraHidden"
              :is-docked-to-camera="isDockedToCamera"
              :is-annotation-active="isAnnotationActive"
              :is-live-zoom-active="isLiveZoomActive"
              @toggle-camera="handleToggleCamera"
              @toggle-dock="handleToggleDock"
              @toggle-annotation="handleToggleAnnotation"
              @toggle-live-zoom="handleToggleLiveZoom"
            />
          </div>
        </main>

        <!-- Countdown Overlay -->
        <CountdownOverlay
          v-if="recordingState === 'countdown'"
          @complete="handleCountdownComplete"
          @cancel="handleCountdownCancel"
        />

        <!-- In-Recording Annotation Canvas Overlay -->
        <AnnotationCanvas
          :is-active="isAnnotationActive"
          @close="isAnnotationActive = false"
        />

        <!-- Studio Review & Export Modal -->
        <StudioReviewModal
          v-if="recordingState === 'review'"
          @close="recordingState = 'idle'"
        />

        <!-- Studio Theme Selector Modal -->
        <ThemeSelectorModal
          :is-open="isThemeModalOpen"
          @close="isThemeModalOpen = false"
        />
      </div>
    </template>
  </div>
</template>
