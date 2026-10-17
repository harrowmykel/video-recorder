<script setup lang="ts">
import {
  Monitor,
  Video,
  Mic,
  MicOff,
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
    class="nordic-surface h-8 px-3 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center gap-2 cursor-pointer shadow-lg select-none"
    @click="emit('toggleCollapse')"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
    <span class="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{{ props.formattedTime }}</span>
    <Maximize2 class="w-3 h-3 text-slate-400" />
  </div>

  <!-- Active Recording State -->
  <div
    v-else-if="props.recordingState === 'recording' || props.recordingState === 'paused'"
    class="nordic-surface h-13 px-3 py-2 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-rose-200 dark:border-rose-500/40 flex items-center gap-2.5 shadow-xl select-none"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <div class="px-0.5 text-slate-400 cursor-grab">
      <GripVertical class="w-4 h-4" />
    </div>

    <!-- Timer Badge -->
    <div class="flex items-center gap-2 px-3 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300">
      <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
      <span class="font-mono text-xs font-bold tabular-nums">{{ props.formattedTime }}</span>
    </div>

    <!-- Pause / Resume -->
    <button
      @click="props.recordingState === 'recording' ? emit('pauseRecord') : emit('resumeRecord')"
      class="h-8 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5"
    >
      <component :is="props.recordingState === 'recording' ? Pause : Play" class="w-3.5 h-3.5" />
      <span>{{ props.recordingState === 'recording' ? 'Pause' : 'Resume' }}</span>
    </button>

    <!-- Annotation -->
    <button
      @click="emit('toggleAnnotation')"
      :class="[
        'h-8 px-3 rounded-xl text-xs font-medium flex items-center gap-1.5 transition',
        props.isAnnotationActive
          ? 'bg-blue-600 text-white'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
      ]"
    >
      <PenTool class="w-3.5 h-3.5" />
      <span>Draw</span>
    </button>

    <!-- Stop CTA -->
    <button
      @click="emit('stopRecord')"
      class="h-8 px-3.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
    >
      <span class="w-2 h-2 rounded-xs bg-white"></span>
      <span>Stop</span>
    </button>

    <!-- Minimize -->
    <button
      @click="emit('toggleCollapse')"
      class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center"
      title="Minimize"
    >
      <Minimize2 class="w-3.5 h-3.5" />
    </button>
  </div>

  <!-- Idle / Ready State -->
  <div
    v-else
    class="nordic-surface h-14 px-2.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-700/80 flex items-center gap-2 select-none shadow-xl"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <div class="px-0.5 text-slate-400 cursor-grab">
      <GripVertical class="w-4 h-4" />
    </div>

    <!-- Segmented Control -->
    <div class="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
      <button class="h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold shadow-sm flex items-center gap-1.5">
        <Monitor class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        <span>Screen</span>
      </button>
      <button class="h-8 px-2 rounded-lg text-slate-600 dark:text-slate-400 text-xs font-medium">
        <span>Window</span>
      </button>
    </div>

    <!-- Camera Toggle -->
    <button
      @click="emit('toggleCamera')"
      :class="[
        'h-9 px-2.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition',
        !props.isCameraHidden
          ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
          : 'bg-transparent text-slate-400 opacity-60'
      ]"
    >
      <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
      <Video class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
      <span>Cam</span>
    </button>

    <!-- Mic Toggle -->
    <button
      @click="emit('toggleMic')"
      class="h-9 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5"
    >
      <component :is="props.isMicMuted ? MicOff : Mic" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
      <div v-if="!props.isMicMuted" class="flex items-end gap-0.5 h-3">
        <span class="w-0.5 h-1.5 bg-emerald-500 rounded-full"></span>
        <span class="w-0.5 h-3 bg-emerald-500 rounded-full"></span>
        <span class="w-0.5 h-2 bg-emerald-500 rounded-full"></span>
      </div>
    </button>

    <!-- Theme / Settings -->
    <button
      @click="emit('openSettings')"
      class="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center hover:bg-slate-200/70 transition"
      title="Themes & Preferences"
    >
      <Settings class="w-4 h-4" />
    </button>

    <!-- Start Recording CTA -->
    <button
      @click="emit('startRecord')"
      class="h-9 px-4 rounded-xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition active:scale-95"
    >
      <span class="w-2 h-2 rounded-full bg-rose-500 dark:bg-white animate-pulse"></span>
      <span>Start</span>
    </button>
  </div>
</template>
