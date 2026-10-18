<script setup lang="ts">
import {
  Monitor,
  AppWindow,
  Crop,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PenTool,
  FileText,
  Pause,
  Play,
  Minimize2,
  Maximize2,
  GripVertical,
  Settings,
  ChevronUp
} from 'lucide-vue-next';
import type { RecordingState, CaptureSourceMode } from '@/types/studio';

const props = defineProps<{
  recordingState: RecordingState;
  captureSourceMode: CaptureSourceMode;
  elapsedSeconds: number;
  formattedTime: string;
  isCameraHidden: boolean;
  isCameraDisabled?: boolean;
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
  (e: 'openNotes'): void;
  (e: 'toggleLiveZoom'): void;
  (e: 'toggleDock'): void;
  (e: 'toggleCollapse'): void;
  (e: 'openSettings'): void;
  (e: 'dragMouseDown', ev: MouseEvent): void;
}>();
</script>

<template>
  <!-- Collapsed Mini-Pill State (Idle & Recording) -->
  <div
    v-if="props.isCollapsed"
    class="nordic-surface h-9 px-3.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5 shadow-lg select-none"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <template v-if="props.recordingState === 'recording' || props.recordingState === 'paused'">
      <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
      <span class="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{{ props.formattedTime }}</span>
    </template>
    <template v-else>
      <button
        @click.stop="emit('startRecord')"
        class="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center"
        title="Quick Record"
      >
        <span class="w-2 h-2 rounded-full bg-white"></span>
      </button>
      <span class="text-xs font-semibold text-slate-700 dark:text-slate-200">Ready</span>
    </template>
    <button
      v-if="props.isCameraHidden"
      @click.stop="emit('toggleCamera')"
      class="w-6 h-6 rounded-full bg-blue-500/15 hover:bg-blue-500/25 flex items-center justify-center text-blue-600 dark:text-blue-400 transition"
      title="Show Camera Bubble"
    >
      <VideoOff class="w-3 h-3" />
    </button>
    <button
      @click.stop="emit('toggleCollapse')"
      class="w-6 h-6 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
      title="Expand Toolbar"
    >
      <Maximize2 class="w-3 h-3" />
    </button>
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

    <div class="flex items-center gap-2 px-3 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300">
      <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
      <span class="font-mono text-xs font-bold tabular-nums">{{ props.formattedTime }}</span>
    </div>

    <button
      @click="props.recordingState === 'recording' ? emit('pauseRecord') : emit('resumeRecord')"
      class="h-8 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5"
    >
      <component :is="props.recordingState === 'recording' ? Pause : Play" class="w-3.5 h-3.5" />
      <span>{{ props.recordingState === 'recording' ? 'Pause' : 'Resume' }}</span>
    </button>

    <!-- Mid-recording Segmented Control (Screen / Window / Area) -->
    <div class="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
      <button
        @click="emit('selectSource', 'display')"
        :class="[
          'h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition',
          props.captureSourceMode === 'display'
            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-400'
        ]"
        title="Switch to Screen Capture"
      >
        <Monitor class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        <span>Screen</span>
      </button>
      <button
        @click="emit('selectSource', 'window')"
        :class="[
          'h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition',
          props.captureSourceMode === 'window'
            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-400'
        ]"
        title="Switch to Window Capture"
      >
        <AppWindow class="w-3.5 h-3.5 text-indigo-500" />
        <span>Window</span>
      </button>
      <button
        @click="emit('selectSource', 'area')"
        :class="[
          'h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition',
          props.captureSourceMode === 'area'
            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-400'
        ]"
        title="Switch to Area Capture"
      >
        <Crop class="w-3.5 h-3.5 text-emerald-500" />
        <span>Area</span>
      </button>
    </div>

    <!-- Camera Split Button -->
    <div class="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <button
        @click="emit('toggleCamera')"
        :class="[
          'h-8 px-2.5 text-xs font-medium flex items-center gap-1.5 transition',
          props.isCameraDisabled
            ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20'
            : !props.isCameraHidden
              ? 'text-slate-800 dark:text-slate-200'
              : 'text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20'
        ]"
        :title="props.isCameraDisabled ? 'Camera Disabled (Click to Enable)' : (props.isCameraHidden ? 'Show Camera Bubble' : 'Hide Camera Bubble')"
      >
        <component :is="(props.isCameraDisabled || props.isCameraHidden) ? VideoOff : Video" class="w-3.5 h-3.5" :class="props.isCameraDisabled ? 'text-rose-500' : 'text-blue-600 dark:text-blue-400'" />
        <span>{{ props.isCameraDisabled ? 'No Cam' : (props.isCameraHidden ? 'Show Cam' : 'Cam') }}</span>
      </button>
      <button
        @click="emit('openCameraMenu')"
        class="h-8 px-1.5 border-l border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
        title="Choose Camera & Background"
      >
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <!-- Mic Split Button -->
    <div class="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <button
        @click="emit('toggleMic')"
        class="h-8 px-2.5 text-slate-800 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5"
        title="Toggle Microphone"
      >
        <component :is="props.isMicMuted ? MicOff : Mic" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        <span>{{ props.isMicMuted ? 'Muted' : 'Mic' }}</span>
      </button>
      <button
        @click="emit('openMicMenu')"
        class="h-8 px-1.5 border-l border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
        title="Choose Microphone"
      >
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <!-- System Audio -->
    <button
      @click="emit('toggleSysAudio')"
      class="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center"
      :title="props.isSysAudioMuted ? 'System Audio Muted' : 'System Audio Active'"
    >
      <component :is="props.isSysAudioMuted ? VolumeX : Volume2" class="w-3.5 h-3.5" />
    </button>

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

    <!-- Session Notes Toggle -->
    <button
      @click="emit('openNotes')"
      class="h-8 px-3 rounded-xl text-xs font-medium flex items-center gap-1.5 transition bg-amber-500/15 text-amber-500 dark:text-amber-300 hover:bg-amber-500/25"
      title="Session Notes (Markdown WYSIWYG)"
    >
      <FileText class="w-3.5 h-3.5" />
      <span>Note</span>
    </button>

    <button
      @click="emit('stopRecord')"
      class="h-8 px-3.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
    >
      <span class="w-2 h-2 rounded-xs bg-white"></span>
      <span>Stop</span>
    </button>

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
    class="nordic-surface h-14 px-2.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-700/80 flex items-center gap-1.5 select-none shadow-xl"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <div class="px-0.5 text-slate-400 cursor-grab">
      <GripVertical class="w-4 h-4" />
    </div>

    <!-- Segmented Control (Screen / Window / Area) -->
    <div class="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
      <button
        @click="emit('selectSource', 'display')"
        :class="[
          'h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition',
          props.captureSourceMode === 'display'
            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-400'
        ]"
      >
        <Monitor class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        <span>Screen</span>
      </button>
      <button
        @click="emit('selectSource', 'window')"
        :class="[
          'h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition',
          props.captureSourceMode === 'window'
            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-400'
        ]"
      >
        <AppWindow class="w-3.5 h-3.5 text-indigo-500" />
        <span>Window</span>
      </button>
      <button
        @click="emit('selectSource', 'area')"
        :class="[
          'h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition',
          props.captureSourceMode === 'area'
            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-400'
        ]"
      >
        <Crop class="w-3.5 h-3.5 text-emerald-500" />
        <span>Area</span>
      </button>
    </div>

    <!-- Camera Split Button -->
    <div class="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <button
        @click="emit('toggleCamera')"
        :class="[
          'h-9 px-2.5 text-xs font-medium flex items-center gap-1.5 transition',
          props.isCameraDisabled
            ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20'
            : !props.isCameraHidden
              ? 'text-slate-800 dark:text-slate-200'
              : 'text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20'
        ]"
        :title="props.isCameraDisabled ? 'Camera Disabled (Click to Enable)' : (props.isCameraHidden ? 'Show Camera Bubble' : 'Hide Camera Bubble')"
      >
        <component :is="(props.isCameraDisabled || props.isCameraHidden) ? VideoOff : Video" class="w-3.5 h-3.5" :class="props.isCameraDisabled ? 'text-rose-500' : 'text-blue-600 dark:text-blue-400'" />
        <span>{{ props.isCameraDisabled ? 'No Cam' : (props.isCameraHidden ? 'Show Cam' : 'Cam') }}</span>
      </button>
      <button
        @click="emit('openCameraMenu')"
        class="h-9 px-1.5 border-l border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
        title="Choose Camera & Background"
      >
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <!-- Mic Split Button -->
    <div class="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <button
        @click="emit('toggleMic')"
        class="h-9 px-2.5 text-slate-800 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5"
      >
        <component :is="props.isMicMuted ? MicOff : Mic" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
      </button>
      <button
        @click="emit('openMicMenu')"
        class="h-9 px-1.5 border-l border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
        title="Choose Microphone"
      >
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <!-- System Audio -->
    <button
      @click="emit('toggleSysAudio')"
      class="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center"
      title="System Audio"
    >
      <component :is="props.isSysAudioMuted ? VolumeX : Volume2" class="w-4 h-4" />
    </button>

    <!-- Session Notes Button (Idle State) -->
    <button
      @click="emit('openNotes')"
      class="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-amber-500 dark:text-amber-300 flex items-center justify-center hover:bg-slate-200/70 transition"
      title="Session Notes (Markdown WYSIWYG)"
    >
      <FileText class="w-4 h-4" />
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
      class="h-9 px-3.5 rounded-xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition active:scale-95"
    >
      <span class="w-2 h-2 rounded-full bg-rose-500 dark:bg-white animate-pulse"></span>
      <span>Start</span>
    </button>

    <!-- Minimize -->
    <button
      @click="emit('toggleCollapse')"
      class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center"
      title="Minimize Toolbar"
    >
      <Minimize2 class="w-3.5 h-3.5" />
    </button>
  </div>
</template>
