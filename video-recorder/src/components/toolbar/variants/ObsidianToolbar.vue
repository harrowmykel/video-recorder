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
    class="obsidian-panel h-10 px-3.5 rounded-full flex items-center gap-2.5 cursor-pointer hover:border-white/25 transition select-none shadow-xl"
    @click="emit('toggleCollapse')"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
    <span class="font-mono text-xs font-semibold text-white/90 tabular-nums">{{ props.formattedTime }}</span>
    <Maximize2 class="w-3.5 h-3.5 text-white/50" />
  </div>

  <!-- Active Recording State -->
  <div
    v-else-if="props.recordingState === 'recording' || props.recordingState === 'paused'"
    class="obsidian-panel h-14 px-3 rounded-2xl flex items-center gap-2.5 border-rose-500/30 select-none shadow-2xl"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <div class="px-1 text-white/30 cursor-grab hover:text-white/60">
      <GripVertical class="w-4 h-4" />
    </div>

    <!-- Timer Badge -->
    <div class="flex items-center gap-2 bg-rose-500/15 border border-rose-500/30 px-3 py-1.5 rounded-xl">
      <span class="relative flex h-2.5 w-2.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
      </span>
      <span class="font-mono text-xs font-bold text-white tabular-nums tracking-wider">{{ props.formattedTime }}</span>
    </div>

    <!-- Pause / Resume -->
    <button
      @click="props.recordingState === 'recording' ? emit('pauseRecord') : emit('resumeRecord')"
      class="h-9 px-3 rounded-xl obsidian-btn text-white/90 text-xs font-medium flex items-center gap-1.5"
    >
      <component :is="props.recordingState === 'recording' ? Pause : Play" class="w-3.5 h-3.5 text-amber-400" />
      <span>{{ props.recordingState === 'recording' ? 'Pause' : 'Resume' }}</span>
    </button>

    <!-- Annotation Toggle -->
    <button
      @click="emit('toggleAnnotation')"
      :class="[
        'h-9 px-3 rounded-xl text-xs font-medium flex items-center gap-1.5 transition',
        props.isAnnotationActive
          ? 'bg-indigo-500/30 border border-indigo-400/40 text-indigo-200'
          : 'obsidian-btn text-white/80'
      ]"
    >
      <PenTool class="w-3.5 h-3.5" />
      <span>Draw</span>
    </button>

    <!-- Finish / Complete -->
    <button
      @click="emit('stopRecord')"
      class="h-9 px-4 rounded-xl bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-rose-500/25"
    >
      <span class="w-2.5 h-2.5 rounded-xs bg-white"></span>
      <span>Finish</span>
      <kbd class="px-1 py-0.5 rounded bg-black/30 text-[9px] font-mono text-white/70">⇧⌘R</kbd>
    </button>

    <!-- Minimize to Corner -->
    <button
      @click="emit('toggleCollapse')"
      class="w-8 h-8 rounded-lg hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition"
      title="Minimize"
    >
      <Minimize2 class="w-3.5 h-3.5" />
    </button>
  </div>

  <!-- Idle / Ready State -->
  <div
    v-else
    class="obsidian-panel h-14 px-3 rounded-2xl flex items-center gap-2 select-none shadow-2xl"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <div class="px-1 text-white/30 cursor-grab hover:text-white/60">
      <GripVertical class="w-4 h-4" />
    </div>

    <!-- Capture Source Segment -->
    <div class="flex items-center bg-black/40 p-1 rounded-xl border border-white/5">
      <button class="h-8 px-2.5 rounded-lg bg-white/10 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm">
        <Monitor class="w-3.5 h-3.5 text-rose-400" />
        <span>Display</span>
      </button>
      <button class="h-8 px-2.5 rounded-lg text-white/50 hover:text-white text-xs font-medium flex items-center gap-1.5 transition">
        <AppWindow class="w-3.5 h-3.5" />
        <span>Window</span>
      </button>
      <button class="h-8 px-2.5 rounded-lg text-white/50 hover:text-white text-xs font-medium flex items-center gap-1.5 transition">
        <Crop class="w-3.5 h-3.5" />
        <span>Area</span>
      </button>
    </div>

    <!-- Camera Toggle Button -->
    <button
      @click="emit('toggleCamera')"
      :class="[
        'h-9 px-2.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition',
        !props.isCameraHidden
          ? 'bg-white/10 border border-white/15 text-white'
          : 'obsidian-btn text-white/50 line-through'
      ]"
    >
      <Video class="w-3.5 h-3.5 text-indigo-400" />
      <span>Cam</span>
    </button>

    <!-- Mic Toggle Button with VU indicator -->
    <button
      @click="emit('toggleMic')"
      :class="[
        'h-9 px-2.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition',
        !props.isMicMuted
          ? 'bg-white/10 border border-white/15 text-white'
          : 'obsidian-btn text-white/40'
      ]"
    >
      <component :is="props.isMicMuted ? MicOff : Mic" class="w-3.5 h-3.5 text-emerald-400" />
      <div v-if="!props.isMicMuted" class="flex items-end gap-0.5 h-3">
        <span class="w-0.5 h-1.5 bg-emerald-400 rounded-full"></span>
        <span class="w-0.5 h-3 bg-emerald-400 rounded-full"></span>
        <span class="w-0.5 h-2 bg-emerald-400 rounded-full"></span>
      </div>
      <span v-else>Muted</span>
    </button>

    <!-- System Audio Toggle -->
    <button
      @click="emit('toggleSysAudio')"
      :class="[
        'w-9 h-9 rounded-xl flex items-center justify-center transition',
        !props.isSysAudioMuted ? 'obsidian-btn text-white/80' : 'obsidian-btn text-white/30'
      ]"
      title="System Audio"
    >
      <component :is="props.isSysAudioMuted ? VolumeX : Volume2" class="w-4 h-4" />
    </button>

    <!-- Theme / Settings Button -->
    <button
      @click="emit('openSettings')"
      class="w-9 h-9 rounded-xl obsidian-btn text-rose-400 hover:text-rose-300 flex items-center justify-center transition"
      title="Themes & Settings"
    >
      <Settings class="w-4 h-4" />
    </button>

    <!-- Primary Record Button -->
    <button
      @click="emit('startRecord')"
      class="h-9 px-4 rounded-xl bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-rose-500/25 active:scale-95 transition"
    >
      <span class="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span>
      <span>Record</span>
      <kbd class="px-1 py-0.5 rounded bg-black/30 text-[9px] font-mono text-white/70">⇧⌘R</kbd>
    </button>
  </div>
</template>
