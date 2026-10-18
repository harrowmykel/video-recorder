<script setup lang="ts">
import CaptureSourceColumn from './settings/CaptureSourceColumn.vue';
import CameraBackgroundColumn from './settings/CameraBackgroundColumn.vue';
import AudioDevicesColumn from './settings/AudioDevicesColumn.vue';
import OverlayDockColumn from './settings/OverlayDockColumn.vue';
import ThemeAppearanceColumn from './settings/ThemeAppearanceColumn.vue';

const props = defineProps<{
  audioVolume: number;
}>();

const emit = defineEmits<{
  (e: 'openAreaPicker'): void;
}>();
</script>

<template>
  <main class="flex-1 overflow-y-auto p-6 md:p-8 z-20">
    <div class="max-w-6xl mx-auto space-y-6">
      <!-- 3 Columns Device & Capture Layout -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Column 1: Screen Capture Source -->
        <CaptureSourceColumn @open-area-picker="emit('openAreaPicker')" />

        <!-- Column 2: Camera Device & Real-Time Background Settings -->
        <CameraBackgroundColumn />

        <!-- Column 3: Audio & Microphone Devices -->
        <AudioDevicesColumn :audio-volume="props.audioVolume" />
      </div>

      <!-- Row 2: Overlays, Controls & Visual Theme -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Overlays & Toolbar Controls (1 Column) -->
        <OverlayDockColumn />

        <!-- Studio Theme & Appearance (Spans 2 Columns) -->
        <ThemeAppearanceColumn />
      </div>
    </div>
  </main>
</template>
