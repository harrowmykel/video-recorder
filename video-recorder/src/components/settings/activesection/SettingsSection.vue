<script setup lang="ts">
import CaptureSourceColumn from '@/components/settings/activesection/settings/CaptureSourceColumn.vue';
import CameraColumn from '@/components/settings/activesection/settings/CameraColumn.vue';
import AudioDevicesColumn from '@/components/settings/activesection/settings/AudioDevicesColumn.vue';
import OverlayDockColumn from '@/components/settings/activesection/settings/OverlayDockColumn.vue';
import ThemeAppearanceColumn from '@/components/settings/activesection/settings/ThemeAppearanceColumn.vue';

const props = defineProps<{
  audioVolume: number;
}>();

const emit = defineEmits<{
  (e: 'openAreaPicker'): void;
  (e: 'openBackgrounds'): void;
  (e: 'navigate', section: 'workspace' | 'settings' | 'backgrounds' | 'ai_studio' | 'sessions'): void;
}>();
</script>

<template>
  <main class="flex-1 overflow-y-auto p-6 md:p-8 z-20">
    <div class="max-w-6xl mx-auto space-y-6">
      <!-- 3 Columns Device & Capture Layout -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Column 1: Screen Capture Source -->
        <CaptureSourceColumn @open-area-picker="emit('openAreaPicker')" />

        <!-- Column 2: Camera Device & More Settings Link -->
        <CameraColumn @open-backgrounds="emit('openBackgrounds')" />

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
