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
  GripHorizontal,
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
      audioLevel.value = 0.3 + Math.random() * 0.45;
    }
  }, 120);
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
  if (vuInterval) clearInterval(vuInterval);
  if (idleTimeout) clearTimeout(idleTimeout);
});

// Loom Idle Dimming: Dim to 20% opacity when cursor leaves during recording
function resetIdleTimer() {
  isIdleDimmed.value = false;
  if (idleTimeout) clearTimeout(idleTimeout);
  if (props.recordingState === 'recording' || props.recordingState === 'paused') {
    idleTimeout = setTimeout(() => {
      if (!isHovered.value) {
        isIdleDimmed.value = true;
      }
    }, 3000);
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
  if (confirm('Discard active recording and reset?')) {
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
  <div>
    <!-- Collapsed Mini-Dot View -->
    <div
      v-if="isCollapsed && (recordingState === 'recording' || recordingState === 'paused')"
      class="glass-pill px-3 py-1.5 rounded-full flex items-center space-x-2 text-xs font-mono cursor-pointer border border-studio-border hover:border-studio-crimson transition-all"
      @click="isCollapsed = false"
      title="Click to expand controls"
    >
      <span class="w-2.5 h-2.5 rounded-full bg-studio-crimson animate-pulse" />
      <span class="font-semibold text-gray-200">{{ formattedTime }}</span>
      <ChevronRight class="w-3.5 h-3.5 text-gray-400" />
    </div>

    <!-- Full Floating Pill -->
    <div
      v-else
      @mouseenter="isHovered = true; isIdleDimmed = false;"
      @mouseleave="isHovered = false; resetIdleTimer();"
      class="glass-pill rounded-2xl px-3.5 py-2 flex items-center space-x-2.5 select-none shadow-2xl transition-all duration-300"
      :class="[
        isIdleDimmed ? 'opacity-20' : 'opacity-100',
        isHovered ? 'ring-1 ring-white/15' : ''
      ]"
    >
      <!-- Draggable Handle -->
      <div class="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-200 px-0.5">
        <GripHorizontal class="w-4 h-4" />
      </div>

      <!-- Main State Controls -->
      <div v-if="recordingState === 'idle'" class="flex items-center space-x-2">
        <button
          @click="handleStart"
          class="flex items-center space-x-2 px-3.5 py-1.5 bg-studio-crimson hover:bg-red-600 active:scale-95 text-white font-medium text-xs rounded-xl transition-all shadow-lg shadow-red-500/20"
          title="Start Recording (Ctrl+Shift+R)"
        >
          <Circle class="w-3.5 h-3.5 fill-current" />
          <span>Record</span>
        </button>

        <div class="h-4 w-px bg-white/10" />

        <div class="flex items-center space-x-1.5 text-xs text-gray-300 px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer">
          <Monitor class="w-3.5 h-3.5 text-studio-indigo" />
          <span class="font-medium">Clean Screen</span>
        </div>
      </div>

      <div v-else class="flex items-center space-x-2">
        <!-- Live Monospace Timer & Indicator -->
        <div class="flex items-center space-x-1.5 px-2 py-1 bg-red-950/40 border border-red-500/20 rounded-lg">
          <span
            class="w-2.5 h-2.5 rounded-full"
            :class="recordingState === 'recording' ? 'bg-studio-crimson animate-pulse' : 'bg-studio-amber'"
          />
          <span class="font-mono text-xs font-semibold text-gray-200 tracking-wider">
            {{ formattedTime }}
          </span>
        </div>

        <!-- Pause / Resume -->
        <button
          @click="handlePauseResume"
          class="p-1.5 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-colors"
          :title="recordingState === 'recording' ? 'Pause Recording' : 'Resume Recording'"
        >
          <Pause v-if="recordingState === 'recording'" class="w-4 h-4 text-studio-amber" />
          <Play v-else class="w-4 h-4 text-studio-emerald fill-current" />
        </button>

        <!-- Stop / Finish -->
        <button
          @click="handleStop"
          class="p-1.5 bg-studio-crimson/20 hover:bg-studio-crimson/30 border border-studio-crimson/30 rounded-lg text-studio-crimson hover:text-red-400 transition-colors"
          title="Finish & Review Recording"
        >
          <Square class="w-4 h-4 fill-current" />
        </button>

        <!-- Loom Quick Restart (↺) -->
        <button
          @click="handleRestart"
          class="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-cyan-400 transition-colors"
          title="Quick Restart (Discard & 3..2..1 retake)"
        >
          <RotateCcw class="w-4 h-4" />
        </button>

        <!-- Loom Instant Discard / Trash (🗑) -->
        <button
          @click="handleDiscard"
          class="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
          title="Instant Discard (Scrap take & reset)"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>

      <div class="h-4 w-px bg-white/10" />

      <!-- Camera Eye Toggle (Hides bubble overlay while camera recording continues in background) -->
      <button
        @click="emit('toggleCamera')"
        class="p-1.5 rounded-lg transition-colors relative"
        :class="isCameraHidden ? 'text-amber-400 hover:bg-amber-500/10' : 'text-gray-300 hover:bg-white/10 hover:text-white'"
        :title="isCameraHidden ? 'Camera Overlay Hidden (Still recording in background!) Click to restore' : 'Hide Camera Overlay (Recording continues in background)'"
      >
        <EyeOff v-if="isCameraHidden" class="w-4 h-4" />
        <Eye v-else class="w-4 h-4" />
        <span
          v-if="isCameraHidden"
          class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-studio-amber ring-2 ring-studio-slate"
        />
      </button>

      <!-- Mic Toggle & Segmented VU-Meter -->
      <div class="flex items-center space-x-1.5 px-1 py-1 rounded-lg hover:bg-white/5">
        <button
          @click="isMicMuted = !isMicMuted"
          class="p-0.5 rounded transition-colors"
          :class="isMicMuted ? 'text-red-400' : 'text-gray-300 hover:text-white'"
          :title="isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'"
        >
          <MicOff v-if="isMicMuted" class="w-3.5 h-3.5" />
          <Mic v-else class="w-3.5 h-3.5" />
        </button>

        <!-- Dynamic Segmented VU-Meter -->
        <div class="flex items-end space-x-0.5 h-3.5 w-7 bg-black/40 rounded px-0.5 py-0.5">
          <div
            class="w-1 bg-studio-emerald rounded-full transition-all duration-75"
            :style="{ height: `${Math.min(100, Math.max(15, audioLevel * 120))}%` }"
          />
          <div
            class="w-1 bg-studio-emerald rounded-full transition-all duration-75"
            :style="{ height: `${Math.min(100, Math.max(10, audioLevel * 100))}%` }"
          />
          <div
            class="w-1 bg-studio-amber rounded-full transition-all duration-75"
            :style="{ height: `${Math.min(100, Math.max(5, (audioLevel - 0.4) * 140))}%` }"
          />
          <div
            class="w-1 bg-studio-crimson rounded-full transition-all duration-75"
            :style="{ height: `${Math.min(100, Math.max(0, (audioLevel - 0.7) * 200))}%` }"
          />
        </div>
      </div>

      <!-- System Audio Loopback Toggle -->
      <button
        @click="isSysAudioMuted = !isSysAudioMuted"
        class="p-1.5 rounded-lg transition-colors"
        :class="isSysAudioMuted ? 'text-red-400 hover:bg-red-500/10' : 'text-gray-300 hover:bg-white/10 hover:text-white'"
        :title="isSysAudioMuted ? 'Unmute Desktop Sound' : 'Mute Desktop Sound'"
      >
        <VolumeX v-if="isSysAudioMuted" class="w-4 h-4" />
        <Volume2 v-else class="w-4 h-4" />
      </button>

      <div class="h-4 w-px bg-white/10" />

      <!-- Live Zoom Trigger Button -->
      <button
        @click="emit('toggleLiveZoom')"
        class="p-1.5 rounded-lg transition-all"
        :class="isLiveZoomActive ? 'bg-studio-indigo text-white shadow-md shadow-indigo-500/30' : 'text-gray-300 hover:bg-white/10 hover:text-white'"
        title="Live Zoom to Cursor (Ctrl+Shift+Z)"
      >
        <ZoomIn class="w-4 h-4" />
      </button>

      <!-- Annotation Canvas Button -->
      <button
        @click="emit('toggleAnnotation')"
        class="p-1.5 rounded-lg transition-all"
        :class="isAnnotationActive ? 'bg-studio-indigo text-white shadow-md shadow-indigo-500/30' : 'text-gray-300 hover:bg-white/10 hover:text-white'"
        title="Screen Annotations (Ctrl+Shift+A)"
      >
        <PenTool class="w-4 h-4" />
      </button>

      <!-- Satellite Docking Button -->
      <button
        @click="emit('toggleDock')"
        class="p-1.5 rounded-lg transition-colors"
        :class="isDockedToCamera ? 'text-studio-indigo hover:bg-indigo-500/15' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'"
        :title="isDockedToCamera ? 'Satellite Docked to Camera Bubble' : 'Dock Toolbar to Camera Bubble'"
      >
        <Link class="w-3.5 h-3.5" />
      </button>

      <!-- Collapse to Mini Dot -->
      <button
        v-if="recordingState !== 'idle'"
        @click="isCollapsed = true"
        class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-gray-200 transition-colors"
        title="Collapse to Mini Indicator"
      >
        <ChevronDown class="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
</template>
