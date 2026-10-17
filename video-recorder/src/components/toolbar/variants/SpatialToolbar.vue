<script setup lang="ts">
import {
  Monitor,
  AppWindow,
  Crop,
  Video,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PenTool,
  Pause,
  Play,
  Minimize2,
  Maximize2,
  GripVertical,
  Settings,
  ChevronUp
} from 'lucide-vue-next';
import type { RecordingState, CaptureSourceMode } from '../../../types/studio';

const props = defineProps<{
  recordingState: RecordingState;
  captureSourceMode: CaptureSourceMode;
  elapsedSeconds: number;
  formattedTime: string;
  isCameraHidden: boolean;
  isMicMuted: boolean;
  isSysAudioMuted: boolean;
  isAnnotationActive: boolean;
  isLiveZoomActive: boolean;
  isDockedToCamera: boolean;
  isCollapsed: boolean;
  audioLevel: number;
}>();

const emit = defineEmits<{
  (e: 'startRecord'): void;
  (e: 'stopRecord'): void;
  (e: 'pauseRecord'): void;
  (e: 'resumeRecord'): void;
  (e: 'selectSource', mode: CaptureSourceMode): void;
  (e: 'toggleCamera'): void;
  (e: 'openCameraMenu'): void;
  (e: 'toggleMic'): void;
  (e: 'openMicMenu'): void;
  (e: 'toggleSysAudio'): void;
  (e: 'toggleAnnotation'): void;
  (e: 'toggleLiveZoom'): void;
  (e: 'toggleDock'): void;
  (e: 'toggleCollapse'): void;
  (e: 'openSettings'): void;
  (e: 'dragMouseDown', ev: MouseEvent): void;
}>();
</script>

<template>
  <!-- Collapsed Mini-Pill State (Works in BOTH Idle and Recording/Paused) -->
  <div
    v-if="props.isCollapsed"
    class="spatial-glass-dark h-9 px-3.5 rounded-full flex items-center gap-2.5 shadow-2xl select-none"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <template v-if="props.recordingState === 'recording' || props.recordingState === 'paused'">
      <span class="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse"></span>
      <span class="font-mono text-xs font-semibold text-white/90 tabular-nums">{{ props.formattedTime }}</span>
    </template>
    <template v-else>
      <button
        @click.stop="emit('startRecord')"
        class="w-5 h-5 rounded-full bg-rose-500 hover:bg-rose-400 flex items-center justify-center shadow"
        title="Quick Record"
      >
        <span class="w-2 h-2 rounded-full bg-white"></span>
      </button>
      <span class="font-mono text-[11px] font-semibold text-white/85">Spatial</span>
    </template>
    <button
      @click.stop="emit('toggleCollapse')"
      class="w-6 h-6 rounded-full hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition"
      title="Expand Toolbar"
    >
      <Maximize2 class="w-3 h-3" />
    </button>
  </div>

  <!-- Active Recording State -->
  <div
    v-else-if="props.recordingState === 'recording' || props.recordingState === 'paused'"
    class="spatial-glass-dark h-14 px-3 rounded-full flex items-center gap-2.5 border-rose-400/40 select-none shadow-2xl"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <div class="pl-2 pr-1 text-white/30 cursor-grab hover:text-white/70">
      <GripVertical class="w-4 h-4" />
    </div>

    <div class="flex items-center gap-2.5 bg-rose-500/20 border border-rose-400/30 px-3.5 py-1.5 rounded-full">
      <span class="relative flex h-2.5 w-2.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-400"></span>
      </span>
      <span class="font-mono text-xs font-bold text-white tabular-nums tracking-wider">{{ props.formattedTime }}</span>
    </div>

    <button
      @click="props.recordingState === 'recording' ? emit('pauseRecord') : emit('resumeRecord')"
      class="h-9 px-3.5 rounded-full spatial-pill-btn text-white/90 text-xs font-medium flex items-center gap-1.5"
    >
      <component :is="props.recordingState === 'recording' ? Pause : Play" class="w-3.5 h-3.5 text-amber-300" />
      <span>{{ props.recordingState === 'recording' ? 'Pause' : 'Resume' }}</span>
    </button>

    <button
      @click="emit('toggleAnnotation')"
      :class="[
        'w-9 h-9 rounded-full flex items-center justify-center transition',
        props.isAnnotationActive
          ? 'bg-sky-400/30 border border-sky-300/50 text-sky-200'
          : 'spatial-pill-btn text-white/80'
      ]"
      title="Draw / Markup"
    >
      <PenTool class="w-3.5 h-3.5" />
    </button>

    <button
      @click="emit('stopRecord')"
      class="h-9 px-4 rounded-full bg-white text-slate-950 hover:bg-slate-100 text-xs font-bold flex items-center gap-1.5 shadow-md transition"
    >
      <span class="w-2.5 h-2.5 rounded-sm bg-rose-600"></span>
      <span>Finish</span>
    </button>

    <button
      @click="emit('toggleCollapse')"
      class="w-8 h-8 rounded-full hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition"
      title="Minimize"
    >
      <Minimize2 class="w-3.5 h-3.5" />
    </button>
  </div>

  <!-- Idle / Ready State -->
  <div
    v-else
    class="spatial-glass-dark h-14 px-3 rounded-full flex items-center gap-1.5 select-none shadow-2xl"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <div class="pl-1 pr-0.5 text-white/30 cursor-grab hover:text-white/70">
      <GripVertical class="w-4 h-4" />
    </div>

    <!-- Segmented Capture Mode -->
    <div class="flex items-center bg-black/35 p-1 rounded-full border border-white/10">
      <button
        @click="emit('selectSource', 'display')"
        :class="[
          'h-8 px-2.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition',
          props.captureSourceMode === 'display'
            ? 'bg-white/15 text-white shadow-sm border border-white/15'
            : 'text-white/65 hover:text-white'
        ]"
      >
        <Monitor class="w-3.5 h-3.5 text-sky-300" />
        <span>Display</span>
      </button>
      <button
        @click="emit('selectSource', 'window')"
        :class="[
          'h-8 px-2.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition',
          props.captureSourceMode === 'window'
            ? 'bg-white/15 text-white shadow-sm border border-white/15'
            : 'text-white/65 hover:text-white'
        ]"
      >
        <AppWindow class="w-3.5 h-3.5 text-indigo-300" />
        <span>Window</span>
      </button>
      <button
        @click="emit('selectSource', 'area')"
        :class="[
          'h-8 px-2.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition',
          props.captureSourceMode === 'area'
            ? 'bg-white/15 text-white shadow-sm border border-white/15'
            : 'text-white/65 hover:text-white'
        ]"
      >
        <Crop class="w-3.5 h-3.5 text-emerald-300" />
        <span>Area</span>
      </button>
    </div>

    <!-- Camera Active Circular Pill + Picker -->
    <div
      :class="[
        'flex items-center rounded-full p-0.5 pr-1.5 gap-1 transition',
        !props.isCameraHidden
          ? 'bg-sky-500/20 border border-sky-400/30'
          : 'bg-white/5 border border-white/10 opacity-60'
      ]"
    >
      <button
        @click="emit('toggleCamera')"
        class="w-8 h-8 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center shadow"
        title="Toggle Camera"
      >
        <Video class="w-3.5 h-3.5" />
      </button>
      <button
        @click="emit('openCameraMenu')"
        class="px-1 text-sky-100 hover:text-white flex items-center gap-0.5 text-[11px] font-semibold"
        title="Choose Camera & Background"
      >
        <span>Cam</span>
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <!-- Mic Active Pill + Picker -->
    <div
      :class="[
        'flex items-center rounded-full p-0.5 pr-2 gap-1.5 transition',
        !props.isMicMuted
          ? 'bg-emerald-500/15 border border-emerald-400/30'
          : 'bg-white/5 border border-white/10 opacity-60'
      ]"
    >
      <button
        @click="emit('toggleMic')"
        class="w-8 h-8 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center shadow"
        title="Toggle Microphone"
      >
        <component :is="props.isMicMuted ? MicOff : Mic" class="w-3.5 h-3.5" />
      </button>
      <button
        @click="emit('openMicMenu')"
        class="text-white/80 hover:text-white flex items-center gap-0.5"
        title="Choose Microphone"
      >
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <!-- System Audio Circular Button -->
    <button
      @click="emit('toggleSysAudio')"
      class="w-9 h-9 rounded-full spatial-pill-btn text-white/80 flex items-center justify-center transition"
      title="System Audio"
    >
      <component :is="props.isSysAudioMuted ? VolumeX : Volume2" class="w-4 h-4" />
    </button>

    <!-- Theme / Settings Button -->
    <button
      @click="emit('openSettings')"
      class="w-9 h-9 rounded-full spatial-pill-btn text-sky-300 flex items-center justify-center transition"
      title="Themes & Settings"
    >
      <Settings class="w-4 h-4" />
    </button>

    <!-- Primary Record Capsule CTA -->
    <button
      @click="emit('startRecord')"
      class="h-9 px-4 rounded-full bg-gradient-to-b from-rose-400 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-rose-500/30 border border-rose-300/40 transition active:scale-95"
    >
      <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
      <span>Record</span>
    </button>

    <!-- Minimize Button -->
    <button
      @click="emit('toggleCollapse')"
      class="w-8 h-8 rounded-full hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition"
      title="Minimize Toolbar"
    >
      <Minimize2 class="w-3.5 h-3.5" />
    </button>
  </div>
</template>
