<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next';
import FloatingToolbar from '../toolbar/FloatingToolbar.vue';
import CameraBubble from '../camera/CameraBubble.vue';
import { useStudioState } from '../../composables/useStudioState';

const props = defineProps<{
  audioVolume: number;
}>();

const emit = defineEmits<{
  (e: 'navigate', section: 'settings' | 'backgrounds'): void;
  (e: 'toggleCamera'): void;
  (e: 'toggleDock'): void;
  (e: 'toggleAnnotation'): void;
  (e: 'toggleLiveZoom'): void;
  (e: 'openAreaPicker'): void;
}>();

const {
  recordingState,
  isCameraHidden,
  isDockedToCamera,
  isAnnotationActive,
  isLiveZoomActive,
  selectedWindowTitle,
  captureArea,
} = useStudioState();
</script>

<template>
  <main class="flex-1 flex items-center justify-center relative p-8">
    <!-- Central Desktop Info Card -->
    <div class="text-center max-w-lg z-0 opacity-75 space-y-3">
      <div
        class="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-gray-300">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>Active Target: {{ selectedWindowTitle }} ({{ captureArea.width }}×{{ captureArea.height }})</span>
      </div>
      <h2 class="text-3xl font-extrabold text-white tracking-tight">
        Screen & Camera Studio
      </h2>
      <p class="text-xs text-gray-400 leading-relaxed">
        Use the floating toolbar below or open <strong>Settings & Devices</strong> / <strong>Real-Time BG</strong> in
        the top bar to switch cameras, pick screen/window/area targets, or apply custom background images in real
        time.
      </p>
      <div class="flex items-center justify-center gap-2 pt-2">
        <button @click="emit('navigate', 'settings')"
          class="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition">
          Configure Devices & Capture Source
        </button>
        <button @click="emit('navigate', 'backgrounds')"
          class="px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-xs font-semibold text-rose-200 transition flex items-center gap-1.5">
          <Sparkles class="w-3.5 h-3.5" />
          <span>Change Camera Background Image</span>
        </button>
      </div>
    </div>

    <!-- Floating Camera Bubble (Draggable preview) -->
    <div class="transition-all duration-300 z-10" :class="[
      isDockedToCamera
        ? 'flex flex-col items-center space-y-12'
        : 'absolute bottom-20 right-16'
    ]">
      <CameraBubble :is-hidden="isCameraHidden" :audio-volume="props.audioVolume"
        :is-recording="recordingState === 'recording'" @hide="isCameraHidden = true" />

      <!-- Docked Toolbar if Satellite mode is enabled -->
      <FloatingToolbar v-if="isDockedToCamera" v-model:recording-state="recordingState"
        :is-camera-hidden="isCameraHidden" :is-docked-to-camera="isDockedToCamera"
        :is-annotation-active="isAnnotationActive" :is-live-zoom-active="isLiveZoomActive"
        @toggle-camera="emit('toggleCamera')" @toggle-dock="emit('toggleDock')"
        @toggle-annotation="emit('toggleAnnotation')" @toggle-live-zoom="emit('toggleLiveZoom')"
        @open-settings-modal="emit('navigate', 'settings')" @open-area-picker="emit('openAreaPicker')" />
    </div>

    <!-- Free-Floating Toolbar when not docked -->
    <div v-if="!isDockedToCamera" class="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
      <FloatingToolbar v-model:recording-state="recordingState" :is-camera-hidden="isCameraHidden"
        :is-docked-to-camera="isDockedToCamera" :is-annotation-active="isAnnotationActive"
        :is-live-zoom-active="isLiveZoomActive" @toggle-camera="emit('toggleCamera')"
        @toggle-dock="emit('toggleDock')" @toggle-annotation="emit('toggleAnnotation')"
        @toggle-live-zoom="emit('toggleLiveZoom')" @open-settings-modal="emit('navigate', 'settings')"
        @open-area-picker="emit('openAreaPicker')" />
    </div>
  </main>
</template>
