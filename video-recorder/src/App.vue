<script setup lang="ts">
import { ref, onMounted } from 'vue';
import FloatingToolbar from './components/toolbar/FloatingToolbar.vue';
import CameraBubble from './components/camera/CameraBubble.vue';
import CountdownOverlay from './components/countdown/CountdownOverlay.vue';
import AnnotationCanvas from './components/annotations/AnnotationCanvas.vue';
import StudioReviewModal from './components/studio/StudioReviewModal.vue';
import { RecordingState } from './types/studio';
import {
  Wifi,
  BatteryCharging,
  Sliders,
  Sparkles,
  Layers,
  Circle,
  Video,
  Eye
} from 'lucide-vue-next';

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
  <div class="w-screen h-screen overflow-hidden select-none font-sans">
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
            class="absolute bottom-10 left-1/2 -translate-x-1/2 z-30"
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
      </div>
    </template>
  </div>
</template>
