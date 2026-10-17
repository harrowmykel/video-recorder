<script setup lang="ts">
import {
  Video,
  Mic,
  PenTool,
  Pause,
  Play,
  Minimize2,
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
  <!-- Collapsed Mini Tally State -->
  <div
    v-if="props.isCollapsed && (props.recordingState === 'recording' || props.recordingState === 'paused')"
    class="machined-chassis h-8 px-3 rounded flex items-center gap-2 border-[#ff2a2a]/60 cursor-pointer select-none font-mono text-xs"
    @click="emit('toggleCollapse')"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <span class="w-2 h-2 rounded-none bg-[#ff2a2a] animate-pulse"></span>
    <span class="font-bold text-white tabular-nums">{{ props.formattedTime }}</span>
    <span class="text-[10px] text-[#00e676]">-6dB</span>
  </div>

  <!-- Active Tally Recording State -->
  <div
    v-else-if="props.recordingState === 'recording' || props.recordingState === 'paused'"
    class="machined-chassis h-14 px-3 rounded-lg flex items-center gap-2.5 border-[#ff2a2a]/60 select-none shadow-2xl font-mono"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <!-- Knurled Grip -->
    <div class="px-1 py-1.5 flex flex-col gap-0.5 cursor-grab opacity-50 hover:opacity-100">
      <div class="w-1 h-1 rounded-full bg-zinc-400"></div>
      <div class="w-1 h-1 rounded-full bg-zinc-400"></div>
      <div class="w-1 h-1 rounded-full bg-zinc-400"></div>
    </div>

    <!-- Recessed SMPTE Timecode Screen -->
    <div class="recessed-screen h-9 px-3 rounded flex items-center gap-2 border-[#ff2a2a]/40">
      <span class="w-2 h-2 rounded-none bg-[#ff2a2a] animate-ping"></span>
      <span class="text-xs font-bold text-[#ff2a2a]">TC</span>
      <span class="text-sm font-bold text-white tabular-nums tracking-widest">{{ props.formattedTime }}</span>
    </div>

    <!-- Hold / Pause Key -->
    <button
      @click="props.recordingState === 'recording' ? emit('pauseRecord') : emit('resumeRecord')"
      class="h-9 px-3 rounded tactile-key text-xs font-mono text-[#ffb800] flex items-center gap-1.5"
    >
      <component :is="props.recordingState === 'recording' ? Pause : Play" class="w-3.5 h-3.5" />
      <span>{{ props.recordingState === 'recording' ? 'HOLD' : 'RUN' }}</span>
    </button>

    <!-- Telestrator Key -->
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

    <!-- CUT / STOP Key -->
    <button
      @click="emit('stopRecord')"
      class="h-9 px-3.5 rounded bg-zinc-100 hover:bg-white text-black font-mono font-bold text-xs flex items-center gap-1.5"
    >
      <span class="w-2.5 h-2.5 bg-[#ff2a2a]"></span>
      <span>CUT / STOP</span>
    </button>

    <!-- Minimize -->
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
    class="machined-chassis h-14 px-2.5 rounded-lg flex items-center gap-2 select-none shadow-2xl font-mono"
    @mousedown="emit('dragMouseDown', $event)"
  >
    <!-- Knurled Grip -->
    <div class="px-1 py-1.5 flex flex-col gap-0.5 cursor-grab opacity-50 hover:opacity-100">
      <div class="w-1 h-1 rounded-full bg-zinc-400"></div>
      <div class="w-1 h-1 rounded-full bg-zinc-400"></div>
      <div class="w-1 h-1 rounded-full bg-zinc-400"></div>
    </div>

    <!-- Input Source Keys -->
    <div class="flex items-center gap-1 bg-[#090a0c] p-1 rounded border border-[#22262e]">
      <button class="h-8 px-2.5 rounded-sm tactile-key border-[#ff5500]/60 text-white text-xs font-mono font-bold flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-[#ff5500]"></span>
        <span>DISP</span>
      </button>
      <button class="h-8 px-2 rounded-sm text-zinc-400 hover:text-zinc-200 text-xs font-mono">
        <span>WIN</span>
      </button>
    </div>

    <!-- Recessed OLED Telemetry Screen -->
    <div class="recessed-screen h-9 px-3 rounded flex items-center gap-2.5">
      <div class="flex flex-col">
        <span class="text-[8px] text-zinc-500 leading-none">MIC_VU</span>
        <div class="flex items-center gap-0.5 mt-1">
          <span class="w-1 h-2 bg-[#00e676]"></span>
          <span class="w-1 h-2 bg-[#00e676]"></span>
          <span class="w-1 h-2 bg-[#00e676]"></span>
          <span class="w-1 h-2 bg-[#ffb800]"></span>
          <span class="w-1 h-2 bg-zinc-800"></span>
        </div>
      </div>
      <div class="h-4 w-px bg-zinc-800"></div>
      <div class="text-[10px] leading-tight">
        <div class="text-[#00e676] font-bold">60 FPS</div>
        <div class="text-zinc-500 text-[8px]">NVENC</div>
      </div>
    </div>

    <!-- Hardware Toggle Push-Keys -->
    <button
      @click="emit('toggleCamera')"
      :class="[
        'h-9 px-2 rounded tactile-key text-xs text-zinc-200 flex items-center gap-1',
        !props.isCameraHidden ? 'border-[#00e676]/40' : 'opacity-50 line-through'
      ]"
    >
      <span class="w-1.5 h-1.5 rounded-full bg-[#00e676]"></span>
      <Video class="w-3.5 h-3.5" />
      <span>CAM</span>
    </button>

    <button
      @click="emit('toggleMic')"
      :class="[
        'h-9 px-2 rounded tactile-key text-xs text-zinc-200 flex items-center gap-1',
        !props.isMicMuted ? 'border-[#00e676]/40' : 'opacity-50'
      ]"
    >
      <span class="w-1.5 h-1.5 rounded-full bg-[#00e676]"></span>
      <Mic class="w-3.5 h-3.5" />
      <span>MIC</span>
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
      class="h-9 px-4 rounded bg-[#ff2a2a] hover:bg-[#ff4040] text-white font-mono font-bold text-xs tracking-wider flex items-center gap-1.5 shadow-[0_2px_0_0_#7f1d1d] active:translate-y-px"
    >
      <span class="w-2.5 h-2.5 rounded-none bg-white"></span>
      <span>REC</span>
    </button>
  </div>
</template>
