<script setup lang="ts">
import {
  Monitor,
  AppWindow,
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
  Settings
} from 'lucide-vue-next';
import { RecordingState } from '../../../types/studio';

const props = defineProps<{
  recordingState: RecordingState;
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
  (e: 'toggleCamera'): void;
  (e: 'toggleMic'): void;
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
  <!-- Collapsed Mini-Pill State -->
  <div
    v-if="props.isCollapsed && (props.recordingState === 'recording' || props.recordingState === 'paused')"
    class="spatial-glass-dark h-9 px-3.5 rounded-full flex items-center gap-2.5 cursor-pointer hover:scale-105 transition shadow-2xl select-none"
    @click="emit('toggleCollapse')"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <span class="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse"></span>
    <span class="font-mono text-xs font-semibold text-white/90 tabular-nums">{{ props.formattedTime }}</span>
    <Maximize2 class="w-3 h-3 text-white/50" />
  </div>

  <!-- Active Recording State -->
  <div
    v-else-if="props.recordingState === 'recording' || props.recordingState === 'paused'"
    class="spatial-glass-dark h-14 px-3 rounded-full flex items-center gap-2.5 border-rose-400/40 select-none shadow-2xl"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <!-- Drag Handle -->
    <div class="pl-2 pr-1 text-white/30 cursor-grab hover:text-white/70">
      <GripVertical class="w-4 h-4" />
    </div>

    <!-- Timer Capsule -->
    <div class="flex items-center gap-2.5 bg-rose-500/20 border border-rose-400/30 px-3.5 py-1.5 rounded-full">
      <span class="relative flex h-2.5 w-2.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-400"></span>
      </span>
      <span class="font-mono text-xs font-bold text-white tabular-nums tracking-wider">{{ props.formattedTime }}</span>
    </div>

    <!-- Pause / Resume Button -->
    <button
      @click="props.recordingState === 'recording' ? emit('pauseRecord') : emit('resumeRecord')"
      class="h-9 px-3.5 rounded-full spatial-pill-btn text-white/90 text-xs font-medium flex items-center gap-1.5"
    >
      <component :is="props.recordingState === 'recording' ? Pause : Play" class="w-3.5 h-3.5 text-amber-300" />
      <span>{{ props.recordingState === 'recording' ? 'Pause' : 'Resume' }}</span>
    </button>

    <!-- Annotation Toggle Pill -->
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

    <!-- Finish Capsule CTA -->
    <button
      @click="emit('stopRecord')"
      class="h-9 px-4 rounded-full bg-white text-slate-950 hover:bg-slate-100 text-xs font-bold flex items-center gap-1.5 shadow-md transition"
    >
      <span class="w-2.5 h-2.5 rounded-sm bg-rose-600"></span>
      <span>Finish</span>
    </button>

    <!-- Minimize Button -->
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
    class="spatial-glass-dark h-14 px-3 rounded-full flex items-center gap-2 select-none shadow-2xl"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <!-- Drag Handle -->
    <div class="pl-2 pr-1 text-white/30 cursor-grab hover:text-white/70">
      <GripVertical class="w-4 h-4" />
    </div>

    <!-- Segmented Capture Mode -->
    <div class="flex items-center bg-black/35 p-1 rounded-full border border-white/10">
      <button class="h-9 px-3.5 rounded-full bg-white/15 text-white text-xs font-semibold flex items-center gap-2 shadow-sm border border-white/15">
        <Monitor class="w-3.5 h-3.5 text-sky-300" />
        <span>Display</span>
      </button>
      <button class="h-9 px-3.5 rounded-full text-white/65 hover:text-white text-xs font-medium flex items-center gap-2 transition">
        <AppWindow class="w-3.5 h-3.5" />
        <span>Window</span>
      </button>
    </div>

    <!-- Camera Active Circular Pill -->
    <div
      @click="emit('toggleCamera')"
      :class="[
        'flex items-center rounded-full p-0.5 pr-2.5 gap-1.5 cursor-pointer transition',
        !props.isCameraHidden
          ? 'bg-sky-500/20 border border-sky-400/30'
          : 'bg-white/5 border border-white/10 opacity-60'
      ]"
    >
      <div class="w-9 h-9 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center shadow">
        <Video class="w-4 h-4" />
      </div>
      <span class="text-[11px] font-semibold text-sky-100">Cam</span>
    </div>

    <!-- Mic Active Pill with Dynamic Equalizer -->
    <div
      @click="emit('toggleMic')"
      :class="[
        'flex items-center rounded-full p-0.5 pr-3 gap-2 cursor-pointer transition',
        !props.isMicMuted
          ? 'bg-emerald-500/15 border border-emerald-400/30'
          : 'bg-white/5 border border-white/10 opacity-60'
      ]"
    >
      <div class="w-9 h-9 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center shadow">
        <component :is="props.isMicMuted ? MicOff : Mic" class="w-4 h-4" />
      </div>
      <div v-if="!props.isMicMuted" class="flex items-end gap-0.5 h-3.5">
        <span class="w-0.5 h-2 bg-emerald-300 rounded-full"></span>
        <span class="w-0.5 h-3.5 bg-emerald-300 rounded-full"></span>
        <span class="w-0.5 h-2 bg-emerald-300 rounded-full"></span>
      </div>
      <span v-else class="text-[11px] text-white/50">Off</span>
    </div>

    <!-- System Audio Circular Button -->
    <button
      @click="emit('toggleSysAudio')"
      class="w-10 h-10 rounded-full spatial-pill-btn text-white/80 flex items-center justify-center transition"
      title="System Audio"
    >
      <component :is="props.isSysAudioMuted ? VolumeX : Volume2" class="w-4 h-4" />
    </button>

    <!-- Theme / Settings Button -->
    <button
      @click="emit('openSettings')"
      class="w-10 h-10 rounded-full spatial-pill-btn text-sky-300 flex items-center justify-center transition"
      title="Themes & Settings"
    >
      <Settings class="w-4 h-4" />
    </button>

    <!-- Primary Record Capsule CTA -->
    <button
      @click="emit('startRecord')"
      class="h-10 px-5 rounded-full bg-gradient-to-b from-rose-400 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-rose-500/30 border border-rose-300/40 transition active:scale-95"
    >
      <span class="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span>
      <span>Record</span>
    </button>
  </div>
</template>
