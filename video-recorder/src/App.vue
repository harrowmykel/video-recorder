<script setup lang="ts">
import { ref, onMounted } from 'vue';
import FloatingToolbar from './components/toolbar/FloatingToolbar.vue';
import CameraBubble from './components/camera/CameraBubble.vue';
import CountdownOverlay from './components/countdown/CountdownOverlay.vue';
import AnnotationCanvas from './components/annotations/AnnotationCanvas.vue';
import StudioReviewModal from './components/studio/StudioReviewModal.vue';
import { RecordingState } from './types/studio';

// Read window target from URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const targetWindow = ref(urlParams.get('window') || 'preview-all');

// Global state
const recordingState = ref<RecordingState>('idle');
const isCameraHidden = ref(false);
const isDockedToCamera = ref(false);
const isAnnotationActive = ref(false);
const isLiveZoomActive = ref(false);
const audioVolume = ref(0.4);

// Simulated audio fluctuation for camera halo
let audioInterval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  audioInterval = setInterval(() => {
    if (recordingState.value === 'recording') {
      audioVolume.value = 0.25 + Math.random() * 0.55;
    } else {
      audioVolume.value = 0.15;
    }
  }, 100);
});

function handleCountdownComplete() {
  recordingState.value = 'recording';
}

function handleCountdownCancel() {
  recordingState.value = 'idle';
}
</script>

<template>
  <div class="w-screen h-screen overflow-hidden select-none">
    <!-- Standalone Window Modes for Tauri Multi-Window -->
    <template v-if="targetWindow === 'toolbar'">
      <div class="p-2">
        <FloatingToolbar
          v-model:recording-state="recordingState"
          :is-camera-hidden="isCameraHidden"
          :is-docked-to-camera="isDockedToCamera"
          :is-annotation-active="isAnnotationActive"
          :is-live-zoom-active="isLiveZoomActive"
          @toggle-camera="isCameraHidden = !isCameraHidden"
          @toggle-dock="isDockedToCamera = !isDockedToCamera"
          @toggle-annotation="isAnnotationActive = !isAnnotationActive"
          @toggle-live-zoom="isLiveZoomActive = !isLiveZoomActive"
        />
      </div>
    </template>

    <template v-else-if="targetWindow === 'camera'">
      <div class="p-2">
        <CameraBubble
          :is-hidden="isCameraHidden"
          :audio-volume="audioVolume"
          :is-recording="recordingState === 'recording'"
          @hide="isCameraHidden = true"
        />
      </div>
    </template>

    <template v-else-if="targetWindow === 'annotations'">
      <AnnotationCanvas
        :is-active="true"
        @close="isAnnotationActive = false"
      />
    </template>

    <template v-else-if="targetWindow === 'countdown'">
      <CountdownOverlay
        @complete="handleCountdownComplete"
        @cancel="handleCountdownCancel"
      />
    </template>

    <!-- Comprehensive Interactive Workspace Preview Harness (Default Web Preview) -->
    <template v-else>
      <div class="relative w-full h-full bg-studio-bg flex flex-col justify-between p-6">
        <!-- Background Simulated Desktop Workspace -->
        <div class="absolute inset-0 opacity-10 bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

        <!-- Top Navigation / Status Header in Preview Harness -->
        <div class="z-10 flex items-center justify-between glass-pill px-5 py-2.5 rounded-2xl border border-white/10 shadow-lg">
          <div class="flex items-center space-x-3">
            <div class="w-3 h-3 rounded-full bg-studio-emerald animate-ping" />
            <h1 class="text-sm font-semibold text-white tracking-wide">
              Screen & Camera Studio Recorder
            </h1>
            <span class="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-studio-indigo/30 text-indigo-300 border border-indigo-400/20">
              Vue 3 + Tauri v2 Architecture
            </span>
          </div>

          <div class="flex items-center space-x-3 text-xs text-gray-400">
            <span>State: <strong class="text-white uppercase font-mono">{{ recordingState }}</strong></span>
            <span>•</span>
            <button
              @click="recordingState = 'review'"
              class="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
            >
              Open Studio Review
            </button>
          </div>
        </div>

        <!-- Center Workspace Simulation -->
        <div class="flex-1 flex items-center justify-center relative">
          <!-- Floating Camera Bubble (Draggable preview) -->
          <div
            class="transition-all duration-300"
            :class="[
              isDockedToCamera
                ? 'flex flex-col items-center space-y-4'
                : 'absolute bottom-16 right-16'
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
              @toggle-camera="isCameraHidden = !isCameraHidden"
              @toggle-dock="isDockedToCamera = !isDockedToCamera"
              @toggle-annotation="isAnnotationActive = !isAnnotationActive"
              @toggle-live-zoom="isLiveZoomActive = !isLiveZoomActive"
            />
          </div>

          <!-- Free-Floating Toolbar when not docked -->
          <div
            v-if="!isDockedToCamera"
            class="absolute bottom-8 left-1/2 -translate-x-1/2 z-30"
          >
            <FloatingToolbar
              v-model:recording-state="recordingState"
              :is-camera-hidden="isCameraHidden"
              :is-docked-to-camera="isDockedToCamera"
              :is-annotation-active="isAnnotationActive"
              :is-live-zoom-active="isLiveZoomActive"
              @toggle-camera="isCameraHidden = !isCameraHidden"
              @toggle-dock="isDockedToCamera = !isDockedToCamera"
              @toggle-annotation="isAnnotationActive = !isAnnotationActive"
              @toggle-live-zoom="isLiveZoomActive = !isLiveZoomActive"
            />
          </div>
        </div>

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
      </div>
    </template>
  </div>
</template>
