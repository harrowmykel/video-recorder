<script setup lang="ts">
import { shallowRef, onMounted, onUnmounted } from 'vue';
import FloatingToolbar from '@/components/toolbar/FloatingToolbar.vue';
import CameraBubble from '@/components/camera/CameraBubble.vue';
import CountdownOverlay from '@/components/countdown/CountdownOverlay.vue';
import AnnotationCanvas from '@/components/annotations/AnnotationCanvas.vue';
import AreaSelectorOverlay from '@/components/toolbar/AreaSelectorOverlay.vue';
import StudioReviewModal from '@/components/studio/StudioReviewModal.vue';
import StudioDashboardView from '@/components/settings/StudioDashboardView.vue';
import SessionNotesWindow from '@/components/notes/SessionNotesWindow.vue';
import { useTheme } from '@/composables/useTheme';
import { useStudioState } from '@/composables/useStudioState';
import {
  invokeCommand,
  subscribeToEvent,
  broadcastEvent,
  getCameraTelemetry,
  buildRecordingSessionFromDaemonMeta,
  isNativeOverlayWindow,
  closeDesktopStudioWindow,
} from '@/lib/tauriBridge';

const { initTheme } = useTheme();
const isNativeOverlay = isNativeOverlayWindow();
const {
  recordingState,
  currentSessionId,
  isCameraHidden,
  isDockedToCamera,
  isAnnotationActive,
  isLiveZoomActive,
  captureSourceMode,
  selectedDisplayId,
  selectedWindowId,
  selectedWindowTitle,
  captureArea,
  isAreaSelectorOpen,
  targetFps,
  countdownDuration,
  chunkDuration,
  autoHideCameraOnRecord,
  isProcessingSession,
  processingStatusMessage,
  selectedCameraId,
  selectedMicId,
  isMicMuted,
  isSysAudioMuted,
  cameraShape,
  lastRecordedSession,
  sessionCameraTelemetry,
} = useStudioState();

// Read window target from URL query parameter or path
const urlParams = new URLSearchParams(window.location.search);
const pathname = window.location.pathname.toLowerCase();
const defaultTarget =
  pathname.includes('setting') || pathname.includes('app') ? 'settings' : 'preview-all';
const targetWindow = shallowRef(urlParams.get('window') || defaultTarget);
const initialSessionId = shallowRef(urlParams.get('session') || '');

function handleCloseStudioWindow() {
  recordingState.value = 'idle';
  closeDesktopStudioWindow();
}

const audioVolume = shallowRef(0.35);

let audioInterval: ReturnType<typeof setInterval> | null = null;
let unsubscribeShortcut: (() => void) | null = null;

async function handleCountdownComplete() {
  if (recordingState.value === 'recording') return;
  recordingState.value = 'recording';
  if (autoHideCameraOnRecord.value) {
    isCameraHidden.value = true;
  }
  sessionCameraTelemetry.value = [
    {
      timeMs: 0,
      x: window.innerWidth ? Math.round(window.innerWidth * 0.82) : 1500,
      y: window.innerHeight ? Math.round(window.innerHeight * 0.72) : 720,
      normX: 0.82,
      normY: 0.72,
      width: 240,
      height: 240,
      shape: cameraShape.value,
      hidden: isCameraHidden.value || selectedCameraId.value === 'none',
    },
  ];
  try {
    const startArgs: any = {
      source_mode: captureSourceMode.value,
      fps: targetFps.value,
      mic_muted: isMicMuted.value,
      sys_audio_muted: isSysAudioMuted.value,
      camera_device: selectedCameraId.value,
      mic_device: selectedMicId.value,
      chunk_duration_sec: chunkDuration.value,
    };
    if (captureSourceMode.value === 'display') {
      startArgs.display_id = selectedDisplayId.value;
      if (captureArea.value.width > 0 && captureArea.value.height > 0) {
        startArgs.x = captureArea.value.x;
        startArgs.y = captureArea.value.y;
        startArgs.width = captureArea.value.width;
        startArgs.height = captureArea.value.height;
      }
    } else if (captureSourceMode.value === 'area') {
      startArgs.x = captureArea.value.x;
      startArgs.y = captureArea.value.y;
      startArgs.width = captureArea.value.width;
      startArgs.height = captureArea.value.height;
    } else if (captureSourceMode.value === 'window') {
      startArgs.window_id = selectedWindowId.value;
    }
    const res = await invokeCommand<{ success?: boolean; session_id?: string }>('start_recording', startArgs);
    if (res?.session_id) {
      currentSessionId.value = res.session_id;
      broadcastEvent('session_started', { sessionId: res.session_id });
    }
  } catch (err) {
    console.warn('Failed to start recording on backend:', err);
  }
}

function handleCountdownCancel() {
  recordingState.value = 'idle';
}

function handleToggleCamera() {
  isCameraHidden.value = !isCameraHidden.value;
}

function handleToggleLiveZoom() {
  isLiveZoomActive.value = !isLiveZoomActive.value;
  invokeCommand('toggle_live_zoom', { active: isLiveZoomActive.value }).catch(() => { });
}

function handleToggleAnnotation() {
  isAnnotationActive.value = !isAnnotationActive.value;
}

function handleToggleDock() {
  isDockedToCamera.value = !isDockedToCamera.value;
}

async function executeShortcutAction(action: string) {
  switch (action) {
    case 'record':
      if (recordingState.value === 'idle') {
        if (countdownDuration.value === 0) {
          await handleCountdownComplete();
        } else {
          recordingState.value = 'countdown';
        }
      } else if (recordingState.value === 'recording' || recordingState.value === 'paused') {
        isProcessingSession.value = true;
        processingStatusMessage.value = 'Joining and finalizing recorded sections...';
        recordingState.value = 'review';
        try {
          const res = await invokeCommand<{ success?: boolean; metadata?: any }>('stop_recording');
          if (res?.metadata) {
            lastRecordedSession.value = await buildRecordingSessionFromDaemonMeta(res.metadata);
          }
        } catch { }
        finally {
          isProcessingSession.value = false;
        }
        getCameraTelemetry().then((telemetry) => {
          if (telemetry && telemetry.length > 0) {
            sessionCameraTelemetry.value = telemetry;
          }
        });
      }
      break;
    case 'pause':
      if (recordingState.value === 'recording') {
        recordingState.value = 'paused';
        invokeCommand('pause_recording').catch(() => { });
      } else if (recordingState.value === 'paused') {
        recordingState.value = 'recording';
        invokeCommand('resume_recording').catch(() => { });
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
    if (!isMicMuted.value && recordingState.value === 'recording') {
      audioVolume.value = 0.25 + Math.random() * 0.55;
    } else {
      audioVolume.value = 0.18;
    }
  }, 100);

  window.addEventListener('keydown', handleGlobalHotkeys);

  if (
    targetWindow.value === 'toolbar' ||
    targetWindow.value === 'preview-all' ||
    targetWindow.value === 'settings'
  ) {
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
      <div class="w-full h-full flex items-end justify-center pb-2">
        <FloatingToolbar v-model:recording-state="recordingState" :is-camera-hidden="isCameraHidden"
          :is-docked-to-camera="isDockedToCamera" :is-annotation-active="isAnnotationActive"
          :is-live-zoom-active="isLiveZoomActive" @toggle-camera="handleToggleCamera" @toggle-dock="handleToggleDock"
          @toggle-annotation="handleToggleAnnotation" @toggle-live-zoom="handleToggleLiveZoom"
          @open-area-picker="isAreaSelectorOpen = true" />
      </div>
    </template>

    <template v-else-if="targetWindow === 'camera'">
      <div class="w-full h-full flex flex-col items-center justify-start pt-3">
        <CameraBubble :is-hidden="isCameraHidden" :audio-volume="audioVolume"
          :is-recording="recordingState === 'recording' || recordingState === 'paused'" @hide="handleToggleCamera" />
      </div>
    </template>

    <template v-else-if="targetWindow === 'annotations'">
      <AnnotationCanvas :is-active="isAnnotationActive" @close="isAnnotationActive = false" />
    </template>

    <template v-else-if="targetWindow === 'area'">
      <AreaSelectorOverlay :is-open="isAreaSelectorOpen" v-model="captureArea"
        @confirm="(r) => { captureArea = r; selectedWindowTitle = `Region (${r.width}×${r.height})`; isAreaSelectorOpen = false; }"
        @close="isAreaSelectorOpen = false" />
    </template>

    <template v-else-if="targetWindow === 'countdown'">
      <CountdownOverlay v-if="recordingState === 'countdown'" :duration="countdownDuration"
        @complete="handleCountdownComplete" @cancel="handleCountdownCancel" />
    </template>

    <template v-else-if="targetWindow === 'studio'">
      <StudioReviewModal :camera-telemetry="sessionCameraTelemetry" :initial-session-id="initialSessionId || undefined"
        @close="handleCloseStudioWindow" />
    </template>

    <template v-else-if="targetWindow === 'notes'">
      <SessionNotesWindow />
    </template>

    <!-- Comprehensive Interactive Workspace, Settings & App Dashboard (localhost:1420 /, /app, /settings) -->
    <template v-else>
      <div class="relative w-full h-full">
        <StudioDashboardView :initial-section="targetWindow === 'settings' ? 'settings' : 'workspace'"
          :audio-volume="audioVolume" @toggle-camera="handleToggleCamera" @toggle-dock="handleToggleDock"
          @toggle-annotation="handleToggleAnnotation" @toggle-live-zoom="handleToggleLiveZoom"
          @open-review-modal="recordingState = 'review'" @open-area-picker="isAreaSelectorOpen = true" />

        <!-- Interactive Area Selector Overlay (Browser mode only; Electron uses dedicated 'area' window) -->
        <AreaSelectorOverlay v-if="!isNativeOverlay" :is-open="isAreaSelectorOpen" v-model="captureArea"
          @confirm="(r) => { captureArea = r; selectedWindowTitle = `Region (${r.width}×${r.height})`; isAreaSelectorOpen = false; }"
          @close="isAreaSelectorOpen = false" />

        <!-- Countdown Overlay (Browser mode only; Electron uses dedicated 'countdown' window) -->
        <CountdownOverlay v-if="!isNativeOverlay && recordingState === 'countdown'" :duration="countdownDuration"
          @complete="handleCountdownComplete" @cancel="handleCountdownCancel" />

        <!-- In-Recording Annotation Canvas Overlay (Browser mode only; Electron uses dedicated 'annotations' window) -->
        <AnnotationCanvas v-if="!isNativeOverlay" :is-active="isAnnotationActive" @close="isAnnotationActive = false" />

        <!-- Studio Review & Export Modal (Browser mode only; Electron uses dedicated 'studio' window) -->
        <StudioReviewModal v-if="!isNativeOverlay && recordingState === 'review'"
          :camera-telemetry="sessionCameraTelemetry" @close="recordingState = 'idle'" />

      </div>
    </template>
  </div>
</template>
