<script setup lang="ts">
import {
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
  <!-- Collapsed Mini Tally State (Idle & Recording) -->
  <div
    v-if="props.isCollapsed"
    class="machined-chassis h-9 px-3 rounded flex items-center gap-2.5 border-[#ff2a2a]/60 select-none font-mono text-xs"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <template v-if="props.recordingState === 'recording' || props.recordingState === 'paused'">
      <span class="w-2 h-2 rounded-none bg-[#ff2a2a] animate-pulse"></span>
      <span class="font-bold text-white tabular-nums">{{ props.formattedTime }}</span>
    </template>
    <template v-else>
      <button
        @click.stop="emit('startRecord')"
        class="px-1.5 py-0.5 rounded bg-[#ff2a2a] text-white text-[10px] font-bold"
      >
        REC
      </button>
      <span class="text-[10px] text-[#00e676]">STBY</span>
    </template>
    <button
      v-if="props.isCameraHidden"
      @click.stop="emit('toggleCamera')"
      class="w-6 h-6 rounded tactile-key border-[#ff5500]/60 text-[#ff5500] hover:text-white flex items-center justify-center"
      title="Show Camera Bubble"
    >
      <VideoOff class="w-3 h-3" />
    </button>
    <button
      @click.stop="emit('toggleCollapse')"
      class="w-6 h-6 rounded tactile-key text-zinc-300 hover:text-white flex items-center justify-center"
      title="Expand Toolbar"
    >
      <Maximize2 class="w-3 h-3" />
    </button>
  </div>

  <!-- Active Tally Recording State -->
  <div
    v-else-if="props.recordingState === 'recording' || props.recordingState === 'paused'"
    class="machined-chassis h-14 px-3 rounded-lg flex items-center gap-2.5 border-[#ff2a2a]/60 select-none shadow-2xl font-mono"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <div class="px-1 py-1.5 flex flex-col gap-0.5 cursor-grab opacity-50 hover:opacity-100">
      <div class="w-1 h-1 rounded-full bg-zinc-400"></div>
      <div class="w-1 h-1 rounded-full bg-zinc-400"></div>
      <div class="w-1 h-1 rounded-full bg-zinc-400"></div>
    </div>

    <div class="recessed-screen h-9 px-3 rounded flex items-center gap-2 border-[#ff2a2a]/40">
      <span class="w-2 h-2 rounded-none bg-[#ff2a2a] animate-ping"></span>
      <span class="text-xs font-bold text-[#ff2a2a]">TC</span>
      <span class="text-sm font-bold text-white tabular-nums tracking-widest">{{ props.formattedTime }}</span>
    </div>

    <button
      @click="props.recordingState === 'recording' ? emit('pauseRecord') : emit('resumeRecord')"
      class="h-9 px-3 rounded tactile-key text-xs font-mono text-[#ffb800] flex items-center gap-1.5"
    >
      <component :is="props.recordingState === 'recording' ? Pause : Play" class="w-3.5 h-3.5" />
      <span>{{ props.recordingState === 'recording' ? 'HOLD' : 'RUN' }}</span>
    </button>

    <!-- Source Switcher mid-recording (DISP / WIN / AREA) -->
    <div class="flex items-center gap-1 bg-[#090a0c] p-1 rounded border border-[#22262e]">
      <button
        @click="emit('selectSource', 'display')"
        :class="[
          'h-8 px-2 rounded-sm text-xs font-mono font-bold flex items-center gap-1 transition',
          props.captureSourceMode === 'display'
            ? 'tactile-key border-[#ff5500]/60 text-white'
            : 'text-zinc-400 hover:text-zinc-200'
        ]"
        title="Switch to Display Capture"
      >
        <span v-if="props.captureSourceMode === 'display'" class="w-1.5 h-1.5 rounded-full bg-[#ff5500]"></span>
        <span>DISP</span>
      </button>
      <button
        @click="emit('selectSource', 'window')"
        :class="[
          'h-8 px-2 rounded-sm text-xs font-mono font-bold flex items-center gap-1 transition',
          props.captureSourceMode === 'window'
            ? 'tactile-key border-[#ff5500]/60 text-white'
            : 'text-zinc-400 hover:text-zinc-200'
        ]"
        title="Switch to Window Capture"
      >
        <span v-if="props.captureSourceMode === 'window'" class="w-1.5 h-1.5 rounded-full bg-[#ff5500]"></span>
        <span>WIN</span>
      </button>
      <button
        @click="emit('selectSource', 'area')"
        :class="[
          'h-8 px-2 rounded-sm text-xs font-mono font-bold flex items-center gap-1 transition',
          props.captureSourceMode === 'area'
            ? 'tactile-key border-[#ff5500]/60 text-white'
            : 'text-zinc-400 hover:text-zinc-200'
        ]"
        title="Switch to Area Capture"
      >
        <span v-if="props.captureSourceMode === 'area'" class="w-1.5 h-1.5 rounded-full bg-[#ff5500]"></span>
        <span>AREA</span>
      </button>
    </div>

    <!-- Hardware Toggle Push-Keys (Camera, Mic, Sys Audio) -->
    <div class="flex items-center rounded tactile-key overflow-hidden">
      <button
        @click="emit('toggleCamera')"
        :class="[
          'h-9 px-2 text-xs flex items-center gap-1 transition',
          props.isCameraDisabled
            ? 'text-rose-400'
            : !props.isCameraHidden
              ? 'text-zinc-200'
              : 'text-[#ff5500]'
        ]"
        :title="props.isCameraDisabled ? 'Camera Disabled (Click to Enable)' : (props.isCameraHidden ? 'Show Camera Bubble' : 'Hide Camera Bubble')"
      >
        <span
          class="w-1.5 h-1.5 rounded-full"
          :class="props.isCameraDisabled ? 'bg-rose-500' : (!props.isCameraHidden ? 'bg-[#00e676]' : 'bg-[#ff5500]')"
        ></span>
        <component :is="(props.isCameraDisabled || props.isCameraHidden) ? VideoOff : Video" class="w-3.5 h-3.5" />
        <span>{{ props.isCameraDisabled ? 'NO CAM' : (props.isCameraHidden ? 'SHOW CAM' : 'CAM') }}</span>
      </button>
      <button
        @click="emit('openCameraMenu')"
        class="h-9 px-1 border-l border-zinc-700 text-zinc-400 hover:text-white flex items-center"
        title="Choose Camera & Background"
      >
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <div class="flex items-center rounded tactile-key overflow-hidden">
      <button
        @click="emit('toggleMic')"
        :class="[
          'h-9 px-2 text-xs text-zinc-200 flex items-center gap-1',
          !props.isMicMuted ? '' : 'opacity-50'
        ]"
        title="Toggle Microphone"
      >
        <span class="w-1.5 h-1.5 rounded-full" :class="!props.isMicMuted ? 'bg-[#00e676]' : 'bg-zinc-600'"></span>
        <component :is="props.isMicMuted ? MicOff : Mic" class="w-3.5 h-3.5" />
        <span>{{ props.isMicMuted ? 'MUTED' : 'MIC' }}</span>
      </button>
      <button
        @click="emit('openMicMenu')"
        class="h-9 px-1 border-l border-zinc-700 text-zinc-400 hover:text-white flex items-center"
        title="Choose Microphone"
      >
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <!-- System Audio -->
    <button
      @click="emit('toggleSysAudio')"
      class="h-9 px-2 rounded tactile-key text-xs font-mono text-zinc-300 flex items-center gap-1"
      :title="props.isSysAudioMuted ? 'System Audio Muted' : 'System Audio Active'"
    >
      <component :is="props.isSysAudioMuted ? VolumeX : Volume2" class="w-3.5 h-3.5" />
    </button>

    <button
      @click="emit('toggleAnnotation')"
      :class="[
        'h-9 px-2.5 rounded tactile-key text-xs font-mono flex items-center gap-1.5 transition',
        props.isAnnotationActive ? 'border-[#ff5500] text-[#ff5500]' : 'text-zinc-300'
      ]"
    >
      <PenTool class="w-3.5 h-3.5" />
      <span>DRAW</span>
    </button>

    <!-- Session Notes Toggle -->
    <button
      @click="emit('openNotes')"
      class="h-9 px-2.5 rounded tactile-key text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1.5 transition"
      title="Session Notes (Markdown WYSIWYG)"
    >
      <FileText class="w-3.5 h-3.5" />
      <span>NOTE</span>
    </button>

    <button
      @click="emit('stopRecord')"
      class="h-9 px-3.5 rounded bg-zinc-100 hover:bg-white text-black font-mono font-bold text-xs flex items-center gap-1.5"
    >
      <span class="w-2.5 h-2.5 bg-[#ff2a2a]"></span>
      <span>CUT / STOP</span>
    </button>

    <button
      @click="emit('toggleCollapse')"
      class="w-7 h-7 rounded tactile-key text-zinc-400 hover:text-white flex items-center justify-center"
      title="Minimize"
    >
      <Minimize2 class="w-3 h-3" />
    </button>
  </div>

  <!-- Idle / Ready Broadcast Console State -->
  <div
    v-else
    class="machined-chassis h-14 px-2.5 rounded-lg flex items-center gap-1.5 select-none shadow-2xl font-mono"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <div class="px-1 py-1.5 flex flex-col gap-0.5 cursor-grab opacity-50 hover:opacity-100">
      <div class="w-1 h-1 rounded-full bg-zinc-400"></div>
      <div class="w-1 h-1 rounded-full bg-zinc-400"></div>
      <div class="w-1 h-1 rounded-full bg-zinc-400"></div>
    </div>

    <!-- Input Source Keys (DISP / WIN / AREA) -->
    <div class="flex items-center gap-1 bg-[#090a0c] p-1 rounded border border-[#22262e]">
      <button
        @click="emit('selectSource', 'display')"
        :class="[
          'h-8 px-2 rounded-sm text-xs font-mono font-bold flex items-center gap-1 transition',
          props.captureSourceMode === 'display'
            ? 'tactile-key border-[#ff5500]/60 text-white'
            : 'text-zinc-400 hover:text-zinc-200'
        ]"
      >
        <span v-if="props.captureSourceMode === 'display'" class="w-1.5 h-1.5 rounded-full bg-[#ff5500]"></span>
        <span>DISP</span>
      </button>
      <button
        @click="emit('selectSource', 'window')"
        :class="[
          'h-8 px-2 rounded-sm text-xs font-mono font-bold flex items-center gap-1 transition',
          props.captureSourceMode === 'window'
            ? 'tactile-key border-[#ff5500]/60 text-white'
            : 'text-zinc-400 hover:text-zinc-200'
        ]"
      >
        <span v-if="props.captureSourceMode === 'window'" class="w-1.5 h-1.5 rounded-full bg-[#ff5500]"></span>
        <span>WIN</span>
      </button>
      <button
        @click="emit('selectSource', 'area')"
        :class="[
          'h-8 px-2 rounded-sm text-xs font-mono font-bold flex items-center gap-1 transition',
          props.captureSourceMode === 'area'
            ? 'tactile-key border-[#ff5500]/60 text-white'
            : 'text-zinc-400 hover:text-zinc-200'
        ]"
      >
        <span v-if="props.captureSourceMode === 'area'" class="w-1.5 h-1.5 rounded-full bg-[#ff5500]"></span>
        <span>AREA</span>
      </button>
    </div>

    <!-- Hardware Toggle Push-Keys -->
    <div class="flex items-center rounded tactile-key overflow-hidden">
      <button
        @click="emit('toggleCamera')"
        :class="[
          'h-9 px-2 text-xs flex items-center gap-1 transition',
          props.isCameraDisabled
            ? 'text-rose-400'
            : !props.isCameraHidden
              ? 'text-zinc-200'
              : 'text-[#ff5500]'
        ]"
        :title="props.isCameraDisabled ? 'Camera Disabled (Click to Enable)' : (props.isCameraHidden ? 'Show Camera Bubble' : 'Hide Camera Bubble')"
      >
        <span
          class="w-1.5 h-1.5 rounded-full"
          :class="props.isCameraDisabled ? 'bg-rose-500' : (!props.isCameraHidden ? 'bg-[#00e676]' : 'bg-[#ff5500]')"
        ></span>
        <component :is="(props.isCameraDisabled || props.isCameraHidden) ? VideoOff : Video" class="w-3.5 h-3.5" />
        <span>{{ props.isCameraDisabled ? 'NO CAM' : (props.isCameraHidden ? 'SHOW CAM' : 'CAM') }}</span>
      </button>
      <button
        @click="emit('openCameraMenu')"
        class="h-9 px-1 border-l border-zinc-700 text-zinc-400 hover:text-white flex items-center"
        title="Choose Camera & Background"
      >
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <div class="flex items-center rounded tactile-key overflow-hidden">
      <button
        @click="emit('toggleMic')"
        :class="[
          'h-9 px-2 text-xs text-zinc-200 flex items-center gap-1',
          !props.isMicMuted ? '' : 'opacity-50'
        ]"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-[#00e676]"></span>
        <Mic class="w-3.5 h-3.5" />
        <span>MIC</span>
      </button>
      <button
        @click="emit('openMicMenu')"
        class="h-9 px-1 border-l border-zinc-700 text-zinc-400 hover:text-white flex items-center"
        title="Choose Microphone"
      >
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <!-- System Audio -->
    <button
      @click="emit('toggleSysAudio')"
      class="h-9 px-2 rounded tactile-key text-zinc-300 hover:text-white flex items-center"
      title="System Audio"
    >
      <component :is="props.isSysAudioMuted ? VolumeX : Volume2" class="w-3.5 h-3.5" />
    </button>

    <!-- Session Notes Button (Idle State) -->
    <button
      @click="emit('openNotes')"
      class="h-9 px-2 rounded tactile-key text-amber-400 hover:text-amber-300 flex items-center gap-1"
      title="Session Notes (Markdown WYSIWYG)"
    >
      <FileText class="w-3.5 h-3.5" />
      <span class="text-[10px]">NOTE</span>
    </button>

    <!-- Theme / Settings -->
    <button
      @click="emit('openSettings')"
      class="h-9 px-2 rounded tactile-key text-[#ff5500] hover:text-[#ff7733] flex items-center gap-1"
      title="Themes & Preferences"
    >
      <Settings class="w-3.5 h-3.5" />
      <span class="text-[10px]">CFG</span>
    </button>

    <!-- Primary Tally REC Key -->
    <button
      @click="emit('startRecord')"
      class="h-9 px-3.5 rounded bg-[#ff2a2a] hover:bg-[#ff4040] text-white font-mono font-bold text-xs tracking-wider flex items-center gap-1.5 shadow-[0_2px_0_0_#7f1d1d] active:translate-y-px"
    >
      <span class="w-2 h-2 rounded-none bg-white"></span>
      <span>REC</span>
    </button>

    <!-- Minimize -->
    <button
      @click="emit('toggleCollapse')"
      class="w-7 h-7 rounded tactile-key text-zinc-400 hover:text-white flex items-center justify-center"
      title="Minimize Toolbar"
    >
      <Minimize2 class="w-3 h-3" />
    </button>
  </div>
</template>
