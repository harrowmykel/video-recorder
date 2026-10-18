<script setup lang="ts">
import { shallowRef, ref, computed, watch, onMounted, onUnmounted, useTemplateRef } from 'vue';
import type { RecordingState, CaptureSourceMode, DisplaySourceInfo, WindowSourceInfo } from '@/types/studio';
import {
  invokeCommand,
  updateAudioSettings,
  moveOverlayWindow,
  resizeOverlayWindow,
  fetchCaptureSources,
  buildRecordingSessionFromDaemonMeta,
  openDesktopSettingsWindow,
  isNativeOverlayWindow,
} from '@/lib/tauriBridge';
import { useTheme } from '@/composables/useTheme';
import { useStudioState } from '@/composables/useStudioState';
import { useMediaDevices } from '@/composables/useMediaDevices';
import {
  Video,
  Mic,
  MicOff,
  Check,
  Sparkles,
  Upload,
  Monitor,
  AppWindow,
  Crop,
  RefreshCw,
  Eye,
  EyeOff,
  VideoOff,
  X
} from 'lucide-vue-next';

// Theme Variants
import ObsidianToolbar from '@/components/toolbar/variants/ObsidianToolbar.vue';
import SpatialToolbar from '@/components/toolbar/variants/SpatialToolbar.vue';
import GraphiteToolbar from '@/components/toolbar/variants/GraphiteToolbar.vue';
import NordicToolbar from '@/components/toolbar/variants/NordicToolbar.vue';

const recordingState = defineModel<RecordingState>('recordingState', { required: true });

const props = defineProps<{
  isCameraHidden: boolean;
  isDockedToCamera: boolean;
  isAnnotationActive: boolean;
  isLiveZoomActive: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggleCamera'): void;
  (e: 'toggleDock'): void;
  (e: 'toggleAnnotation'): void;
  (e: 'toggleLiveZoom'): void;
  (e: 'openSettingsModal'): void;
  (e: 'openAreaPicker'): void;
}>();

const { currentTheme, initTheme } = useTheme();
const {
  isToolbarCollapsed,
  captureSourceMode,
  selectedDisplayId,
  selectedWindowId,
  selectedWindowTitle,
  captureArea,
  selectedCameraId,
  selectedMicId,
  isMicMuted,
  isSysAudioMuted,
  bgMode,
  bgImageUrl,
  bgPresets,
  lastRecordedSession,
  setCustomBgImageFromFile,
} = useStudioState();

const { cameras, microphones, liveMicLevel, refreshDevices, startMicMeter, stopMicMeter } = useMediaDevices();

const elapsedSeconds = shallowRef(0);
const audioLevel = shallowRef(0.35);
const activePopover = shallowRef<'camera' | 'mic' | 'source' | null>(null);
const displays = ref<DisplaySourceInfo[]>([]);
const windows = ref<WindowSourceInfo[]>([]);
const isLoadingSources = shallowRef(false);
const bgFileInput = useTemplateRef<HTMLInputElement>('bgFileInput');

let timerInterval: ReturnType<typeof setInterval> | null = null;
let vuInterval: ReturnType<typeof setInterval> | null = null;

// Native OS window pointer dragging with 4px movement threshold so clicks on collapsed pill never get swallowed
let isPointerDown = false;
let isDraggingWindow = false;
let startScreenX = 0;
let startScreenY = 0;
let lastScreenX = 0;
let lastScreenY = 0;

function onDragMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (target?.closest('button, input, select, a, [data-popover]')) return;
  isPointerDown = true;
  isDraggingWindow = false;
  startScreenX = e.screenX;
  startScreenY = e.screenY;
  lastScreenX = e.screenX;
  lastScreenY = e.screenY;
  window.addEventListener('mousemove', onDragMouseMove);
  window.addEventListener('mouseup', onDragMouseUp);
}

function onDragMouseMove(e: MouseEvent) {
  if (!isPointerDown) return;
  const totalDx = Math.abs(e.screenX - startScreenX);
  const totalDy = Math.abs(e.screenY - startScreenY);
  if (!isDraggingWindow && totalDx + totalDy > 4) {
    isDraggingWindow = true;
  }
  if (!isDraggingWindow) return;
  const dx = e.screenX - lastScreenX;
  const dy = e.screenY - lastScreenY;
  lastScreenX = e.screenX;
  lastScreenY = e.screenY;
  moveOverlayWindow('toolbar', dx, dy);
}

function onDragMouseUp() {
  if (isPointerDown && !isDraggingWindow && isToolbarCollapsed.value) {
    // Clicked on the collapsed pill without dragging -> expand it
    isToolbarCollapsed.value = false;
  }
  isPointerDown = false;
  isDraggingWindow = false;
  window.removeEventListener('mousemove', onDragMouseMove);
  window.removeEventListener('mouseup', onDragMouseUp);
}

// Dynamically size Electron toolbar window so popovers & modals are never clipped
watch(
  [isToolbarCollapsed, activePopover, () => props.isCameraHidden],
  ([collapsed, popover, cameraHidden]) => {
   if (popover !== null) {
      resizeOverlayWindow('toolbar', 760, 390);
    } else if (collapsed) {
      resizeOverlayWindow('toolbar', cameraHidden ? 230 : 190, 58);
    } else {
      resizeOverlayWindow('toolbar', 760, 88);
    }
  },
  { immediate: true }
);

// Timer during recording
watch(
  recordingState,
  (state) => {
    if (state === 'recording') {
      activePopover.value = null;
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

// Synchronize mic device hot-swap and mute state with daemon in real-time
watch(
  [selectedMicId, isMicMuted, isSysAudioMuted],
  async ([micId, micMuted, sysMuted]) => {
    if (recordingState.value === 'recording' || recordingState.value === 'paused') {
      try {
        await updateAudioSettings({
          mic_device: micId,
          mic_muted: micMuted,
          sys_audio_muted: sysMuted,
        });
      } catch (err) {
        console.warn('[FloatingToolbar] updateAudioSettings failed:', err);
      }
    }
  }
);

watch(selectedMicId, (newMicId) => {
  stopMicMeter();
  startMicMeter(newMicId);
});

onMounted(() => {
  initTheme();
  refreshDevices(false);
  startMicMeter(selectedMicId.value);
  vuInterval = setInterval(() => {
    if (isMicMuted.value) {
      audioLevel.value = 0;
    } else if (liveMicLevel.value > 0.02) {
      audioLevel.value = liveMicLevel.value;
    } else {
      audioLevel.value = 0.25 + Math.random() * 0.35;
    }
  }, 100);
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
  if (vuInterval) clearInterval(vuInterval);
  stopMicMeter();
  onDragMouseUp();
});

const formattedTime = computed(() => {
  const m = Math.floor(elapsedSeconds.value / 60);
  const s = elapsedSeconds.value % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
});

async function loadCaptureSources() {
  isLoadingSources.value = true;
  try {
    const res = await fetchCaptureSources();
    displays.value = res.displays;
    windows.value = res.windows;
  } finally {
    isLoadingSources.value = false;
  }
}

async function handleSelectSource(mode: CaptureSourceMode) {
  captureSourceMode.value = mode;
  if (mode === 'area') {
    activePopover.value = null;
    emit('openAreaPicker');
    return;
  }
  if (activePopover.value === 'source') {
    activePopover.value = null;
  } else {
    activePopover.value = 'source';
    await loadCaptureSources();
  }
}

function handleToggleCameraPopover() {
  if (activePopover.value === 'camera') {
    activePopover.value = null;
  } else {
    refreshDevices(true);
    activePopover.value = 'camera';
  }
}

function handleToggleCamera() {
  if (selectedCameraId.value === 'none') {
    const fallback = cameras.value.find((c) => c.deviceId !== 'none')?.deviceId || 'default';
    selectedCameraId.value = fallback;
    if (props.isCameraHidden) {
      emit('toggleCamera');
    }
  } else {
    emit('toggleCamera');
  }
}

function handleToggleMicPopover() {
  if (activePopover.value === 'mic') {
    activePopover.value = null;
  } else {
    refreshDevices(true);
    activePopover.value = 'mic';
  }
}

async function handleCustomBgUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    await setCustomBgImageFromFile(file);
  }
}

function handleStart() {
  activePopover.value = null;
  recordingState.value = 'countdown';
}

async function handlePause() {
  recordingState.value = 'paused';
  await invokeCommand('pause_recording').catch(() => {});
}

async function handleResume() {
  recordingState.value = 'recording';
  await invokeCommand('resume_recording').catch(() => {});
}

async function handleStop() {
  recordingState.value = 'review';
  try {
    const res = await invokeCommand<{ success?: boolean; metadata?: any }>('stop_recording');
    if (res?.metadata) {
      lastRecordedSession.value = await buildRecordingSessionFromDaemonMeta(res.metadata);
    }
  } catch (err) {
    console.warn('[FloatingToolbar] stop_recording error:', err);
  }
}

function handleOpenSettings() {
  activePopover.value = null;
  if (!isNativeOverlayWindow()) {
    return;
  }
    openDesktopSettingsWindow();
    emit('openSettingsModal');
}

const activeToolbarVariant = computed(() => {
  switch (currentTheme.value) {
    case 'spatial':
      return SpatialToolbar;
    case 'graphite':
      return GraphiteToolbar;
    case 'nordic':
      return NordicToolbar;
    case 'obsidian':
    default:
      return ObsidianToolbar;
  }
});
</script>

<template>
  <div class="relative font-sans select-none flex flex-col items-center justify-end">
    <!-- Popover 1: Camera Device & Real-Time Virtual Background Picker -->
    <div
      v-if="activePopover === 'camera'"
      data-popover="true"
      class="mb-2.5 w-[440px] p-4 rounded-2xl bg-[#0e111a]/95 backdrop-blur-xl border border-white/15 shadow-2xl text-white space-y-3.5 z-50"
    >
      <div class="flex items-center justify-between border-b border-white/10 pb-2">
        <div class="flex items-center gap-2 text-xs font-bold">
          <Video class="w-4 h-4 text-indigo-400" />
          <span>Camera & Real-Time Background</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            v-if="selectedCameraId !== 'none'"
            @click="emit('toggleCamera')"
            :class="[
              'px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border transition',
              props.isCameraHidden
                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/40 text-emerald-300'
                : 'bg-white/5 hover:bg-white/10 border-white/15 text-white/75 hover:text-white'
            ]"
            :title="props.isCameraHidden ? 'Show Camera Bubble' : 'Hide Camera Bubble'"
          >
            <component :is="props.isCameraHidden ? Eye : EyeOff" class="w-3 h-3" />
            <span>{{ props.isCameraHidden ? 'Show Bubble' : 'Hide Bubble' }}</span>
          </button>
          <button
            v-else
            @click="selectedCameraId = cameras[0]?.deviceId || 'default'; if (props.isCameraHidden) emit('toggleCamera');"
            class="px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-400/40 text-indigo-300 transition"
            title="Enable Camera Recording"
          >
            <Video class="w-3 h-3" />
            <span>Enable Cam</span>
          </button>
          <button
            @click="activePopover = null"
            class="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Camera Hardware Selector -->
      <div class="space-y-1.5">
        <span class="text-[10px] font-mono uppercase tracking-wider text-white/50 block">Choose Camera Device</span>
        <div class="space-y-1 max-h-32 overflow-y-auto">
          <!-- Dedicated No Camera Option -->
          <button
            @click="selectedCameraId = 'none'; if (!props.isCameraHidden) emit('toggleCamera');"
            :class="[
              'w-full px-3 py-1.5 rounded-xl text-left text-xs flex items-center justify-between transition border',
              selectedCameraId === 'none'
                ? 'bg-rose-500/20 border-rose-400/50 text-white font-semibold'
                : 'bg-white/5 border-transparent hover:bg-white/10 text-white/75'
            ]"
          >
            <div class="flex items-center gap-2 truncate">
              <VideoOff class="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span class="truncate">No Camera (Screen Only)</span>
            </div>
            <Check v-if="selectedCameraId === 'none'" class="w-3.5 h-3.5 text-rose-400 shrink-0" />
          </button>

          <button
            v-for="cam in cameras"
            :key="cam.deviceId"
            @click="selectedCameraId = cam.deviceId; if (props.isCameraHidden) emit('toggleCamera');"
            :class="[
              'w-full px-3 py-1.5 rounded-xl text-left text-xs flex items-center justify-between transition border',
              selectedCameraId === cam.deviceId
                ? 'bg-indigo-500/20 border-indigo-400/50 text-white font-semibold'
                : 'bg-white/5 border-transparent hover:bg-white/10 text-white/75'
            ]"
          >
            <div class="flex items-center gap-2 truncate">
              <Video class="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span class="truncate">{{ cam.label }}</span>
            </div>
            <Check v-if="selectedCameraId === cam.deviceId" class="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          </button>
        </div>
      </div>

      <!-- Real-Time Background Mode Selector -->
      <div v-if="selectedCameraId !== 'none'" class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-mono uppercase tracking-wider text-white/50 flex items-center gap-1">
            <Sparkles class="w-3 h-3 text-rose-400" />
            <span>Real-Time Background Mode</span>
          </span>
          <button
            @click="bgFileInput?.click()"
            class="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-300 text-[11px] font-semibold flex items-center gap-1 transition"
          >
            <Upload class="w-3 h-3" />
            <span>Upload BG Image</span>
          </button>
          <input
            ref="bgFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleCustomBgUpload"
          />
        </div>

        <div class="grid grid-cols-5 gap-1.5">
          <button
            v-for="mode in (['off', 'blur', 'transparent', 'image', 'gradient'] as const)"
            :key="mode"
            @click="bgMode = mode"
            :class="[
              'py-1.5 px-2 rounded-xl text-[11px] font-semibold capitalize border transition',
              bgMode === mode
                ? 'bg-rose-500 text-white border-rose-400 shadow'
                : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
            ]"
          >
            {{ mode === 'transparent' ? 'Cutout' : mode }}
          </button>
        </div>

        <!-- Preset Studio Background Images Strip -->
        <div class="grid grid-cols-4 gap-2 pt-1">
          <button
            v-for="preset in bgPresets"
            :key="preset.id"
            @click="bgMode = preset.type; if (preset.type === 'image') bgImageUrl = preset.value;"
            class="h-10 rounded-xl border border-white/15 hover:border-white/50 overflow-hidden relative group transition"
            :style="{ background: preset.thumbnail }"
            :title="preset.name"
          >
            <span class="absolute inset-x-0 bottom-0 bg-black/70 text-[9px] text-white font-medium py-0.5 truncate px-1">
              {{ preset.name }}
            </span>
          </button>
        </div>
      </div>

      <!-- Placeholder when Camera is Disabled -->
      <div v-else class="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 text-center space-y-1">
        <div class="flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-300">
          <VideoOff class="w-3.5 h-3.5" />
          <span>Camera Recording Disabled</span>
        </div>
        <p class="text-[11px] text-white/50">
          Select a camera device above to enable camera PiP, virtual backgrounds, and cutout modes.
        </p>
      </div>
    </div>

    <!-- Popover 2: Microphone Device Picker -->
    <div
      v-else-if="activePopover === 'mic'"
      data-popover="true"
      class="mb-2.5 w-80 p-4 rounded-2xl bg-[#0e111a]/95 backdrop-blur-xl border border-white/15 shadow-2xl text-white space-y-3 z-50"
    >
      <div class="flex items-center justify-between border-b border-white/10 pb-2">
        <div class="flex items-center gap-2 text-xs font-bold">
          <Mic class="w-4 h-4 text-emerald-400" />
          <span>Microphone Input</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            @click="isMicMuted = !isMicMuted"
            :class="[
              'px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border transition',
              isMicMuted
                ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400/40 text-rose-300'
                : 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/40 text-emerald-300'
            ]"
            :title="isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'"
          >
            <component :is="isMicMuted ? MicOff : Mic" class="w-3 h-3" />
            <span>{{ isMicMuted ? 'Muted' : 'Live' }}</span>
          </button>
          <button
            @click="activePopover = null"
            class="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div class="space-y-1 max-h-40 overflow-y-auto">
        <button
          v-for="mic in microphones"
          :key="mic.deviceId"
          @click="selectedMicId = mic.deviceId; isMicMuted = false; startMicMeter(mic.deviceId); activePopover = null;"
          :class="[
            'w-full px-3 py-2 rounded-xl text-left text-xs flex items-center justify-between transition border',
            selectedMicId === mic.deviceId
              ? 'bg-emerald-500/20 border-emerald-400/50 text-white font-semibold'
              : 'bg-white/5 border-transparent hover:bg-white/10 text-white/75'
          ]"
        >
          <span class="truncate">{{ mic.label }}</span>
          <Check v-if="selectedMicId === mic.deviceId" class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        </button>
      </div>
    </div>

    <!-- Popover 3: Display / Window / Area Source Picker -->
    <div
      v-else-if="activePopover === 'source'"
      data-popover="true"
      class="mb-2.5 w-[440px] p-4 rounded-2xl bg-[#0e111a]/95 backdrop-blur-xl border border-white/15 shadow-2xl text-white space-y-3 z-50"
    >
      <div class="flex items-center justify-between border-b border-white/10 pb-2">
        <div class="flex items-center gap-2 text-xs font-bold">
          <component :is="captureSourceMode === 'window' ? AppWindow : Monitor" class="w-4 h-4 text-rose-400" />
          <span>{{ captureSourceMode === 'window' ? 'Select Window to Record' : 'Select Display or Region' }}</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            @click="loadCaptureSources"
            class="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
            title="Refresh list"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="isLoadingSources ? 'animate-spin' : ''" />
          </button>
          <button
            @click="activePopover = null"
            class="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Display List -->
      <div v-if="captureSourceMode === 'display'" class="space-y-1.5 max-h-44 overflow-y-auto">
        <button
          v-for="d in displays"
          :key="d.id"
          @click="selectedDisplayId = d.id; selectedWindowTitle = d.name; captureArea = { x: d.x, y: d.y, width: d.width, height: d.height }; activePopover = null;"
          :class="[
            'w-full px-3 py-2 rounded-xl text-left text-xs flex items-center justify-between transition border',
            selectedDisplayId === d.id
              ? 'bg-rose-500/20 border-rose-400/50 text-white font-semibold'
              : 'bg-white/5 border-transparent hover:bg-white/10 text-white/80'
          ]"
        >
          <div>
            <div class="font-semibold">{{ d.name }}</div>
            <div class="text-[10px] font-mono text-white/50">{{ d.width }} × {{ d.height }}</div>
          </div>
          <Check v-if="selectedDisplayId === d.id" class="w-3.5 h-3.5 text-rose-400" />
        </button>
      </div>

      <!-- Window List -->
      <div v-else-if="captureSourceMode === 'window'" class="space-y-1.5 max-h-48 overflow-y-auto">
        <button
          v-for="w in windows"
          :key="w.id"
          @click="selectedWindowId = w.id; selectedWindowTitle = w.title; captureArea = { x: w.x, y: w.y, width: w.width, height: w.height }; activePopover = null;"
          :class="[
            'w-full px-3 py-2 rounded-xl text-left text-xs flex items-center justify-between transition border',
            selectedWindowId === w.id
              ? 'bg-indigo-500/20 border-indigo-400/50 text-white font-semibold'
              : 'bg-white/5 border-transparent hover:bg-white/10 text-white/80'
          ]"
        >
          <div class="min-w-0 pr-2">
            <div class="font-semibold truncate">{{ w.title }}</div>
            <div class="text-[10px] font-mono text-white/50">{{ w.appName }} • {{ w.width }} × {{ w.height }}</div>
          </div>
          <Check v-if="selectedWindowId === w.id" class="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        </button>
      </div>

      <!-- Bottom Quick Action for Custom Area -->
      <div class="pt-1 border-t border-white/10 flex items-center justify-between text-[11px]">
        <span class="text-white/50 font-mono truncate max-w-[240px]">Target: {{ selectedWindowTitle }}</span>
        <button
          @click="captureSourceMode = 'area'; activePopover = null; emit('openAreaPicker')"
          class="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 font-semibold flex items-center gap-1"
        >
          <Crop class="w-3 h-3" />
          <span>Draw Custom Area</span>
        </button>
      </div>
    </div>

    <!-- Active Toolbar Theme Variant -->
    <component
      :is="activeToolbarVariant"
      :recording-state="recordingState"
      :capture-source-mode="captureSourceMode"
      :elapsed-seconds="elapsedSeconds"
      :formatted-time="formattedTime"
      :is-camera-hidden="props.isCameraHidden || selectedCameraId === 'none'"
      :is-camera-disabled="selectedCameraId === 'none'"
      :is-mic-muted="isMicMuted"
      :is-sys-audio-muted="isSysAudioMuted"
      :is-annotation-active="props.isAnnotationActive"
      :is-live-zoom-active="props.isLiveZoomActive"
      :is-docked-to-camera="props.isDockedToCamera"
      :is-collapsed="isToolbarCollapsed"
      :audio-level="audioLevel"
      @start-record="handleStart"
      @stop-record="handleStop"
      @pause-record="handlePause"
      @resume-record="handleResume"
      @select-source="handleSelectSource"
      @toggle-camera="handleToggleCamera"
      @open-camera-menu="handleToggleCameraPopover"
      @toggle-mic="isMicMuted = !isMicMuted"
      @open-mic-menu="handleToggleMicPopover"
      @toggle-sys-audio="isSysAudioMuted = !isSysAudioMuted"
      @toggle-annotation="emit('toggleAnnotation')"
      @toggle-live-zoom="emit('toggleLiveZoom')"
      @toggle-dock="emit('toggleDock')"
      @toggle-collapse="activePopover = null; isToolbarCollapsed = !isToolbarCollapsed"
      @open-settings="handleOpenSettings"
      @drag-mouse-down="onDragMouseDown"
    />

  </div>
</template>
