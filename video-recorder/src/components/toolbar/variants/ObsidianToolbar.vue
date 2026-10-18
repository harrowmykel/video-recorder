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
  Pause,
  Play,
  Minimize2,
  Maximize2,
  GripVertical,
  Settings,
  ChevronUp,
  Link2
} from 'lucide-vue-next';
import type { RecordingState, CaptureSourceMode } from '../../../types/studio';

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
    class="obsidian-panel h-10 px-3.5 rounded-full flex items-center gap-2.5 hover:border-white/25 transition select-none shadow-xl"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <template v-if="props.recordingState === 'recording' || props.recordingState === 'paused'">
      <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
      <span class="font-mono text-xs font-semibold text-white/90 tabular-nums">{{ props.formattedTime }}</span>
    </template>
    <template v-else>
      <button
        @click.stop="emit('startRecord')"
        class="w-6 h-6 rounded-full bg-rose-500 hover:bg-rose-400 flex items-center justify-center shadow"
        title="Quick Record"
      >
        <span class="w-2 h-2 rounded-full bg-white"></span>
      </button>
      <span class="font-mono text-[11px] font-semibold text-white/80">Mini Bar</span>
    </template>
    <button
      v-if="props.isCameraHidden"
      @click.stop="emit('toggleCamera')"
      class="w-6 h-6 rounded-full bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-400/40 flex items-center justify-center text-indigo-300 hover:text-white transition"
      title="Show Camera Bubble"
    >
      <VideoOff class="w-3.5 h-3.5" />
    </button>
    <button
      @click.stop="emit('toggleCollapse')"
      class="w-6 h-6 rounded-full hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition"
      title="Expand Toolbar"
    >
      <Maximize2 class="w-3.5 h-3.5" />
    </button>
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

    <!-- Camera Toggle + Device Picker Split Button -->
    <div class="flex items-center rounded-xl overflow-hidden border border-white/10 bg-white/5">
      <button
        @click="emit('toggleCamera')"
        :class="[
          'h-9 px-2.5 text-xs font-medium flex items-center gap-1.5 transition',
          props.isCameraDisabled
            ? 'text-rose-300 bg-rose-500/15 hover:bg-rose-500/25'
            : !props.isCameraHidden
              ? 'text-white hover:bg-white/10'
              : 'text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/25'
        ]"
        :title="props.isCameraDisabled ? 'Camera Disabled (Click to Enable)' : (props.isCameraHidden ? 'Show Camera Bubble' : 'Hide Camera Bubble')"
      >
        <component :is="(props.isCameraDisabled || props.isCameraHidden) ? VideoOff : Video" class="w-3.5 h-3.5" :class="props.isCameraDisabled ? 'text-rose-400' : 'text-indigo-400'" />
        <span>{{ props.isCameraDisabled ? 'No Cam' : (props.isCameraHidden ? 'Show Cam' : 'Cam') }}</span>
      </button>
      <button
        @click="emit('openCameraMenu')"
        class="h-9 px-1.5 border-l border-white/10 text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center transition"
        title="Choose Camera & Virtual Background"
      >
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <!-- Mic Toggle + Device Picker Split Button -->
    <div class="flex items-center rounded-xl overflow-hidden border border-white/10 bg-white/5">
      <button
        @click="emit('toggleMic')"
        :class="[
          'h-9 px-2.5 text-xs font-medium flex items-center gap-1.5 transition',
          !props.isMicMuted ? 'text-white hover:bg-white/10' : 'text-white/40 hover:bg-white/5'
        ]"
        title="Toggle Microphone"
      >
        <component :is="props.isMicMuted ? MicOff : Mic" class="w-3.5 h-3.5 text-emerald-400" />
        <div v-if="!props.isMicMuted" class="flex items-end gap-0.5 h-3">
          <span class="w-0.5 bg-emerald-400 rounded-full transition-all" :style="{ height: `${Math.max(4, Math.round(props.audioLevel * 12))}px` }"></span>
          <span class="w-0.5 bg-emerald-400 rounded-full transition-all" :style="{ height: `${Math.max(6, Math.round(props.audioLevel * 16))}px` }"></span>
          <span class="w-0.5 bg-emerald-400 rounded-full transition-all" :style="{ height: `${Math.max(3, Math.round(props.audioLevel * 10))}px` }"></span>
        </div>
        <span v-else>Muted</span>
      </button>
      <button
        @click="emit('openMicMenu')"
        class="h-9 px-1.5 border-l border-white/10 text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center transition"
        title="Choose Microphone Input"
      >
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <!-- System Audio Toggle Button -->
    <button
      @click="emit('toggleSysAudio')"
      :class="[
        'h-9 px-2.5 rounded-xl border border-white/10 text-xs font-medium flex items-center gap-1.5 transition',
        !props.isSysAudioMuted ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-white/5 text-white/40 hover:bg-white/10'
      ]"
      :title="props.isSysAudioMuted ? 'System Audio Muted' : 'System Audio Active'"
    >
      <component :is="props.isSysAudioMuted ? VolumeX : Volume2" class="w-3.5 h-3.5 text-sky-400" />
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
      title="Minimize Toolbar"
    >
      <Minimize2 class="w-3.5 h-3.5" />
    </button>
  </div>

  <!-- Idle / Ready State -->
  <div
    v-else
    class="obsidian-panel h-14 px-3 rounded-2xl flex items-center gap-1.5 select-none shadow-2xl"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <div class="px-0.5 text-white/30 cursor-grab hover:text-white/60">
      <GripVertical class="w-4 h-4" />
    </div>

    <!-- Capture Source Segment (Display / Window / Area) -->
    <div class="flex items-center bg-black/40 p-1 rounded-xl border border-white/5">
      <button
        @click="emit('selectSource', 'display')"
        :class="[
          'h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition',
          props.captureSourceMode === 'display'
            ? 'bg-white/10 text-white shadow-sm'
            : 'text-white/50 hover:text-white'
        ]"
        title="Record Entire Display"
      >
        <Monitor class="w-3.5 h-3.5 text-rose-400" />
        <span>Display</span>
      </button>
      <button
        @click="emit('selectSource', 'window')"
        :class="[
          'h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition',
          props.captureSourceMode === 'window'
            ? 'bg-white/10 text-white shadow-sm'
            : 'text-white/50 hover:text-white'
        ]"
        title="Select Application Window"
      >
        <AppWindow class="w-3.5 h-3.5 text-indigo-400" />
        <span>Window</span>
      </button>
      <button
        @click="emit('selectSource', 'area')"
        :class="[
          'h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition',
          props.captureSourceMode === 'area'
            ? 'bg-white/10 text-white shadow-sm'
            : 'text-white/50 hover:text-white'
        ]"
        title="Select Custom Screen Area"
      >
        <Crop class="w-3.5 h-3.5 text-emerald-400" />
        <span>Area</span>
      </button>
    </div>

    <!-- Camera Toggle + Device Picker Split Button -->
    <div class="flex items-center rounded-xl overflow-hidden border border-white/10 bg-white/5">
      <button
        @click="emit('toggleCamera')"
        :class="[
          'h-9 px-2.5 text-xs font-medium flex items-center gap-1.5 transition',
          props.isCameraDisabled
            ? 'text-rose-300 bg-rose-500/15 hover:bg-rose-500/25'
            : !props.isCameraHidden
              ? 'text-white hover:bg-white/10'
              : 'text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/25'
        ]"
        :title="props.isCameraDisabled ? 'Camera Disabled (Click to Enable)' : (props.isCameraHidden ? 'Show Camera Bubble' : 'Hide Camera Bubble')"
      >
        <component :is="(props.isCameraDisabled || props.isCameraHidden) ? VideoOff : Video" class="w-3.5 h-3.5" :class="props.isCameraDisabled ? 'text-rose-400' : 'text-indigo-400'" />
        <span>{{ props.isCameraDisabled ? 'No Cam' : (props.isCameraHidden ? 'Show Cam' : 'Cam') }}</span>
      </button>
      <button
        @click="emit('openCameraMenu')"
        class="h-9 px-1.5 border-l border-white/10 text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center transition"
        title="Choose Camera & Virtual Background"
      >
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <!-- Mic Toggle + Device Picker Split Button -->
    <div class="flex items-center rounded-xl overflow-hidden border border-white/10 bg-white/5">
      <button
        @click="emit('toggleMic')"
        :class="[
          'h-9 px-2.5 text-xs font-medium flex items-center gap-1.5 transition',
          !props.isMicMuted ? 'text-white hover:bg-white/10' : 'text-white/40 hover:bg-white/5'
        ]"
        title="Toggle Microphone"
      >
        <component :is="props.isMicMuted ? MicOff : Mic" class="w-3.5 h-3.5 text-emerald-400" />
        <div v-if="!props.isMicMuted" class="flex items-end gap-0.5 h-3">
          <span class="w-0.5 bg-emerald-400 rounded-full transition-all" :style="{ height: `${Math.max(4, Math.round(props.audioLevel * 12))}px` }"></span>
          <span class="w-0.5 bg-emerald-400 rounded-full transition-all" :style="{ height: `${Math.max(6, Math.round(props.audioLevel * 16))}px` }"></span>
          <span class="w-0.5 bg-emerald-400 rounded-full transition-all" :style="{ height: `${Math.max(3, Math.round(props.audioLevel * 10))}px` }"></span>
        </div>
        <span v-else>Muted</span>
      </button>
      <button
        @click="emit('openMicMenu')"
        class="h-9 px-1.5 border-l border-white/10 text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center transition"
        title="Choose Microphone Device"
      >
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

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

    <!-- Dock to Camera Toggle -->
    <button
      @click="emit('toggleDock')"
      :class="[
        'w-9 h-9 rounded-xl flex items-center justify-center transition',
        props.isDockedToCamera ? 'bg-indigo-500/30 border border-indigo-400/50 text-indigo-300' : 'obsidian-btn text-white/60 hover:text-white'
      ]"
      title="Dock / Undock Toolbar to Camera Bubble"
    >
      <Link2 class="w-3.5 h-3.5" />
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
      class="h-9 px-3.5 rounded-xl bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-rose-500/25 active:scale-95 transition"
    >
      <span class="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span>
      <span>Record</span>
    </button>

    <!-- Minimize Toolbar Button (Idle state) -->
    <button
      @click="emit('toggleCollapse')"
      class="w-8 h-8 rounded-lg hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition"
      title="Minimize Toolbar"
    >
      <Minimize2 class="w-3.5 h-3.5" />
    </button>
  </div>
</template>
