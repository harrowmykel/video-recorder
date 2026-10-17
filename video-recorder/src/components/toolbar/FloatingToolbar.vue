<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
  Circle,
  Square,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Eye,
  EyeOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ZoomIn,
  PenTool,
  Link,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Monitor
} from 'lucide-vue-next';
import { RecordingState } from '../../types/studio';
import { invokeCommand } from '../../lib/tauriBridge';

const props = defineProps<{
  recordingState: RecordingState;
  isCameraHidden: boolean;
  isDockedToCamera: boolean;
  isAnnotationActive: boolean;
  isLiveZoomActive: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:recordingState', state: RecordingState): void;
  (e: 'toggleCamera'): void;
  (e: 'toggleDock'): void;
  (e: 'toggleAnnotation'): void;
  (e: 'toggleLiveZoom'): void;
}>();

const elapsedSeconds = ref(0);
const isMicMuted = ref(false);
const isSysAudioMuted = ref(false);
const isCollapsed = ref(false);
const isHovered = ref(false);
const isIdleDimmed = ref(false);
const audioLevel = ref(0.4);

let timerInterval: ReturnType<typeof setInterval> | null = null;
let vuInterval: ReturnType<typeof setInterval> | null = null;
let idleTimeout: ReturnType<typeof setTimeout> | null = null;

// Timer during recording
watch(
  () => props.recordingState,
  (state) => {
    if (state === 'recording') {
      if (!timerInterval) {
        timerInterval = setInterval(() => {
          elapsedSeconds.value++;
        }, 1000);
      }
    } else if (state === 'idle') {
      elapsedSeconds.value = 0;
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    } else if (state === 'paused') {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }
  },
  { immediate: true }
);

// Audio VU-meter simulation
onMounted(() => {
  vuInterval = setInterval(() => {
    if (isMicMuted.value || props.recordingState === 'idle') {
      audioLevel.value = 0;
    } else {
      audioLevel.value = 0.35 + Math.random() * 0.45;
    }
  }, 100);
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
  if (vuInterval) clearInterval(vuInterval);
  if (idleTimeout) clearTimeout(idleTimeout);
});

// Loom Idle Dimming: Dim to 25% opacity when cursor leaves during recording
function resetIdleTimer() {
  isIdleDimmed.value = false;
  if (idleTimeout) clearTimeout(idleTimeout);
  if (props.recordingState === 'recording' || props.recordingState === 'paused') {
    idleTimeout = setTimeout(() => {
      if (!isHovered.value) {
        isIdleDimmed.value = true;
      }
    }, 2800);
  }
}

watch([() => props.recordingState, isHovered], () => {
  resetIdleTimer();
});

const formattedTime = computed(() => {
  const m = Math.floor(elapsedSeconds.value / 60);
  const s = elapsedSeconds.value % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
});

function handleStart() {
  emit('update:recordingState', 'countdown');
}

function handlePauseResume() {
  if (props.recordingState === 'recording') {
    emit('update:recordingState', 'paused');
  } else if (props.recordingState === 'paused') {
    emit('update:recordingState', 'recording');
  }
}

async function handleStop() {
  emit('update:recordingState', 'review');
  await invokeCommand('stop_recording');
}

async function handleDiscard() {
  if (confirm('Discard active recording buffer and reset?')) {
    emit('update:recordingState', 'idle');
    elapsedSeconds.value = 0;
    await invokeCommand('discard_recording');
  }
}

function handleRestart() {
  elapsedSeconds.value = 0;
  emit('update:recordingState', 'countdown');
}
</script>

<template>
  <div class="font-sans">
    <!-- Collapsed Mini-Dot View -->
    <div
      v-if="isCollapsed && (recordingState === 'recording' || recordingState === 'paused')"
      class="glass-pill px-3.5 py-1.5 rounded-full flex items-center space-x-2 text-xs font-mono cursor-pointer border border-white/10 hover:border-red-500/50 transition-all shadow-xl hover:scale-105 active:scale-95"
      @click="isCollapsed = false"
      title="Click to expand controls"
    >
      <span class="w-2 h-2 rounded-full bg-studio-crimson animate-ping" />
      <span class="font-medium tracking-wider text-gray-100">{{ formattedTime }}</span>
      <ChevronRight class="w-3.5 h-3.5 text-gray-400" />
    </div>

    <!-- Full Floating Pill (Ultra-Refined) -->
    <div
      v-else
      @mouseenter="isHovered = true; isIdleDimmed = false;"
      @mouseleave="isHovered = false; resetIdleTimer();"
      class="glass-pill rounded-2xl px-4 py-2.5 flex items-center space-x-3 select-none transition-all duration-300"
      :class="[
        isIdleDimmed ? 'opacity-25 blur-[0.2px]' : 'opacity-100',
        isHovered ? 'ring-1 ring-white/20 shadow-2xl scale-[1.01]' : 'shadow-xl'
      ]"
    >
      <!-- Draggable Grip Indicator -->
      <div class="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 transition-colors pr-0.5">
        <GripVertical class="w-4 h-4" />
      </div>

      <!-- State: IDLE Controls -->
      <div v-if="recordingState === 'idle'" class="flex items-center space-x-2.5">
        <!-- Big Red Record Button with Glow -->
        <button
          @click="handleStart"
          class="btn-primary flex items-center space-x-2 px-4 py-2 text-white font-semibold text-xs rounded-xl transition-transform active:scale-95 cursor-pointer"
          title="Start Recording (Ctrl+Shift+R)"
        >
          <span class="w-2.5 h-2.5 rounded-full bg-white shadow-sm" />
          <span class="tracking-wide">Start Record</span>
        </button>

        <div class="h-4 w-px bg-white/10" />

        <!-- Screen Target Indicator -->
        <div class="flex items-center space-x-1.5 text-xs text-gray-300 px-2.5 py-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer border border-transparent hover:border-white/5">
          <Monitor class="w-3.5 h-3.5 text-indigo-400" />
          <span class="font-medium">Clean Screen</span>
        </div>
      </div>

      <!-- State: RECORDING / PAUSED Controls -->
      <div v-else class="flex items-center space-x-2">
        <!-- Monospace Timer Badge -->
        <div class="flex items-center space-x-2 px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-xl shadow-inner">
          <span
            class="w-2.5 h-2.5 rounded-full"
            :class="recordingState === 'recording' ? 'bg-studio-crimson shadow-[0_0_10px_#FF3B30] animate-pulse' : 'bg-amber-400 shadow-[0_0_10px_#F59E0B]'"
          />
          <span class="font-mono text-xs font-semibold text-gray-100 tracking-widest">
            {{ formattedTime }}
          </span>
        </div>

        <!-- Pause / Resume -->
        <button
          @click="handlePauseResume"
          class="p-2 hover:bg-white/10 rounded-xl text-gray-300 hover:text-white transition-all active:scale-95"
          :title="recordingState === 'recording' ? 'Pause Recording' : 'Resume Recording'"
        >
          <Pause v-if="recordingState === 'recording'" class="w-4 h-4 text-amber-400" />
          <Play v-else class="w-4 h-4 text-emerald-400 fill-current" />
        </button>

        <!-- Stop / Finish -->
        <button
          @click="handleStop"
          class="p-2 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 rounded-xl text-red-400 hover:text-red-300 transition-all active:scale-95 shadow-sm"
          title="Finish & Review Recording"
        >
          <Square class="w-4 h-4 fill-current" />
        </button>

        <!-- Loom Quick Restart (↺) -->
        <button
          @click="handleRestart"
          class="p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-cyan-300 transition-all active:scale-95"
          title="Quick Restart (Discard current take & 3..2..1 retake)"
        >
          <RotateCcw class="w-4 h-4" />
        </button>

        <!-- Loom Instant Discard / Trash (🗑) -->
        <button
          @click="handleDiscard"
          class="p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-red-400 transition-all active:scale-95"
          title="Instant Discard (Scrap take & reset)"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>

      <div class="h-4 w-px bg-white/10" />

      <!-- Camera Eye Toggle (Hides bubble overlay while camera recording continues in background) -->
      <button
        @click="emit('toggleCamera')"
        class="p-2 rounded-xl transition-all relative active:scale-95"
        :class="isCameraHidden ? 'text-amber-400 bg-amber-400/10 border border-amber-400/30' : 'text-gray-300 hover:bg-white/10 hover:text-white'"
        :title="isCameraHidden ? 'Camera Overlay Hidden (Still recording in background!) Click to restore' : 'Hide Camera Overlay (Recording continues in background)'"
      >
        <EyeOff v-if="isCameraHidden" class="w-4 h-4" />
        <Eye v-else class="w-4 h-4" />
        <span
          v-if="isCameraHidden"
          class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_#F59E0B]"
        />
      </button>

      <!-- Mic Toggle & Segmented VU-Meter -->
      <div class="flex items-center space-x-2 px-1.5 py-1 rounded-xl hover:bg-white/[0.06] transition-colors border border-transparent hover:border-white/5">
        <button
          @click="isMicMuted = !isMicMuted"
          class="p-1 rounded-lg transition-colors"
          :class="isMicMuted ? 'text-red-400' : 'text-gray-300 hover:text-white'"
          :title="isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'"
        >
          <MicOff v-if="isMicMuted" class="w-3.5 h-3.5" />
          <Mic v-else class="w-3.5 h-3.5" />
        </button>

        <!-- Segmented LED-Style VU-Meter -->
        <div class="flex items-end space-x-0.5 h-4 w-7 bg-black/60 rounded-md px-1 py-0.5 border border-white/5 shadow-inner">
          <div
            class="w-1 bg-emerald-400 rounded-full transition-all duration-75 shadow-[0_0_4px_#10B981]"
            :style="{ height: `${Math.min(100, Math.max(20, audioLevel * 120))}%` }"
          />
          <div
            class="w-1 bg-emerald-400 rounded-full transition-all duration-75 shadow-[0_0_4px_#10B981]"
            :style="{ height: `${Math.min(100, Math.max(15, audioLevel * 100))}%` }"
          />
          <div
            class="w-1 bg-amber-400 rounded-full transition-all duration-75 shadow-[0_0_4px_#F59E0B]"
            :style="{ height: `${Math.min(100, Math.max(5, (audioLevel - 0.4) * 140))}%` }"
          />
          <div
            class="w-1 bg-red-500 rounded-full transition-all duration-75 shadow-[0_0_4px_#EF4444]"
            :style="{ height: `${Math.min(100, Math.max(0, (audioLevel - 0.7) * 200))}%` }"
          />
        </div>
      </div>

      <!-- System Audio Loopback Toggle -->
      <button
        @click="isSysAudioMuted = !isSysAudioMuted"
        class="p-2 rounded-xl transition-all active:scale-95"
        :class="isSysAudioMuted ? 'text-red-400 bg-red-400/10 border border-red-400/30' : 'text-gray-300 hover:bg-white/10 hover:text-white'"
        :title="isSysAudioMuted ? 'Unmute Desktop Sound' : 'Mute Desktop Sound'"
      >
        <VolumeX v-if="isSysAudioMuted" class="w-4 h-4" />
        <Volume2 v-else class="w-4 h-4" />
      </button>

      <div class="h-4 w-px bg-white/10" />

      <!-- Live Zoom Trigger Button -->
      <button
        @click="emit('toggleLiveZoom')"
        class="p-2 rounded-xl transition-all active:scale-95 relative"
        :class="isLiveZoomActive ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] border border-indigo-400/30' : 'text-gray-300 hover:bg-white/10 hover:text-white'"
        title="Live Zoom to Cursor (Ctrl+Shift+Z)"
      >
        <ZoomIn class="w-4 h-4" />
      </button>

      <!-- Annotation Canvas Button -->
      <button
        @click="emit('toggleAnnotation')"
        class="p-2 rounded-xl transition-all active:scale-95 relative"
        :class="isAnnotationActive ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] border border-indigo-400/30' : 'text-gray-300 hover:bg-white/10 hover:text-white'"
        title="Screen Annotations (Ctrl+Shift+A)"
      >
        <PenTool class="w-4 h-4" />
      </button>

      <!-- Satellite Docking Button -->
      <button
        @click="emit('toggleDock')"
        class="p-2 rounded-xl transition-all active:scale-95"
        :class="isDockedToCamera ? 'text-indigo-400 bg-indigo-500/15 border border-indigo-400/30 shadow-[0_0_10px_rgba(99,102,241,0.3)]' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'"
        :title="isDockedToCamera ? 'Satellite Docked to Camera Bubble' : 'Dock Toolbar to Camera Bubble'"
      >
        <Link class="w-3.5 h-3.5" />
      </button>

      <!-- Collapse to Mini Dot -->
      <button
        v-if="recordingState !== 'idle'"
        @click="isCollapsed = true"
        class="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
        title="Collapse to Mini Indicator"
      >
        <ChevronDown class="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
</template>
