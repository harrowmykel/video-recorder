<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted, useTemplateRef } from 'vue';
import {
  Play,
  Pause,
  Scissors,
  Download,
  FolderOpen,
  ZoomIn,
  Sparkles,
  Monitor,
  Smartphone,
  Ratio,
  Maximize2,
  Video,
  Film,
  RefreshCw,
  Trash2,
} from 'lucide-vue-next';
import type { CameraTelemetryPoint, RecordingSession } from '@/types/studio';
import {
  fetchRecordedSessions,
  openExportDirectory,
  subscribeToEvent,
  deleteSession,
  STUDIO_PROJECTS_DIR,
} from '@/lib/tauriBridge';

import { useStudioState } from '@/composables/useStudioState';
import ExportDestinationModal from '@/components/studio/ExportDestinationModal.vue';

const props = defineProps<{
  cameraTelemetry?: CameraTelemetryPoint[];
  initialSessionId?: string;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const { lastRecordedSession, isProcessingSession, processingStatusMessage } = useStudioState();

type PreviewAspectRatio = '16:9' | '9:16' | 'original' | 'fullscreen';
const previewRatio = shallowRef<PreviewAspectRatio>('16:9');
const isPlayerFullscreen = shallowRef(false);
const videoNaturalWidth = shallowRef(1920);
const videoNaturalHeight = shallowRef(1080);

const isExportModalOpen = shallowRef(false);
const isPlaying = shallowRef(false);
const currentTime = shallowRef(0);
const duration = shallowRef(15.0);
const trimStartPct = shallowRef(0);
const trimEndPct = shallowRef(100);
const isAutoZoomActive = shallowRef(true);
const isCameraPiPVisible = shallowRef(true);
const hasVideoLoaded = shallowRef(false);
const hasCameraVideoLoaded = shallowRef(false);
const statusNotice = shallowRef<string | null>(null);

const sessions = ref<RecordingSession[]>([]);
const selectedSessionId = shallowRef<string>(props.initialSessionId || '');

const screenVideoRef = useTemplateRef<HTMLVideoElement>('screenVideoRef');
const cameraVideoRef = useTemplateRef<HTMLVideoElement>('cameraVideoRef');
const micAudioRef = useTemplateRef<HTMLAudioElement>('micAudioRef');
const sysAudioRef = useTemplateRef<HTMLAudioElement>('sysAudioRef');
const timelineRef = useTemplateRef<HTMLDivElement>('timelineRef');

let fallbackPlayInterval: ReturnType<typeof setInterval> | null = null;
let unsubscribeCameraUpload: (() => void) | null = null;
let unsubscribeSelectSession: (() => void) | null = null;

const activeSession = computed<RecordingSession | null>(() => {
  if (selectedSessionId.value) {
    const found = sessions.value.find((s) => s.id === selectedSessionId.value);
    if (found) return found;
  }
  if (lastRecordedSession.value) return lastRecordedSession.value;
  return sessions.value[0] || null;
});

const hasCameraTrack = computed(() => {
  return Boolean(
    activeSession.value?.cameraRawPath &&
    activeSession.value.cameraRawPath.trim().length > 0 &&
    activeSession.value?.cameraUrl
  );
});

const currentSessionId = computed(() => activeSession.value?.id || 'session_latest');

async function loadSessionsList() {
  const list = await fetchRecordedSessions();
  sessions.value = list;
  if (props.initialSessionId) {
    selectedSessionId.value = props.initialSessionId;
  } else if (lastRecordedSession.value) {
    const exists = list.some((s) => s.id === lastRecordedSession.value?.id);
    if (!exists) {
      sessions.value.unshift(lastRecordedSession.value);
    }
    selectedSessionId.value = lastRecordedSession.value.id;
  } else if (list.length > 0 && !selectedSessionId.value) {
    selectedSessionId.value = list[0].id;
  }
}

watch(() => props.initialSessionId, (newId) => {
  if (newId) {
    selectedSessionId.value = newId;
  }
});

watch(lastRecordedSession, async (newSess) => {
  if (newSess) {
    await loadSessionsList();
    selectedSessionId.value = newSess.id;
  }
});

watch(activeSession, (sess) => {
  hasVideoLoaded.value = false;
  hasCameraVideoLoaded.value = false;
  isPlaying.value = false;
  currentTime.value = 0;
  if (sess?.durationMs) {
    duration.value = Math.max(1, Number((sess.durationMs / 1000).toFixed(1)));
  }
});

const viewportClass = computed(() => {
  if (isPlayerFullscreen.value) {
    return 'w-full h-full max-h-[75vh]';
  }
  switch (previewRatio.value) {
    case '9:16':
      return 'aspect-[9/16] h-[52vh] max-w-[29.25vh] mx-auto';
    case 'original':
      return 'max-h-[52vh] w-auto mx-auto';
    case 'fullscreen':
      return 'w-full h-full max-h-[75vh]';
    case '16:9':
    default:
      return 'w-full aspect-video max-h-[52vh] mx-auto';
  }
});

const viewportStyle = computed(() => {
  if (previewRatio.value === 'original' && videoNaturalWidth.value && videoNaturalHeight.value) {
    return {
      aspectRatio: `${videoNaturalWidth.value} / ${videoNaturalHeight.value}`,
    };
  }
  return {};
});

function toggleFullscreen() {
  isPlayerFullscreen.value = !isPlayerFullscreen.value;
  if (isPlayerFullscreen.value) {
    previewRatio.value = 'fullscreen';
  } else {
    previewRatio.value = '16:9';
  }
}

const pipStyle = computed(() => {
  const isNarrow = previewRatio.value === '9:16';
  const defaultSize = isNarrow ? 110 : 192;
  const telemetry = props.cameraTelemetry;
  if (!telemetry || !telemetry.length) {
    return {
      bottom: '16px',
      right: '16px',
      width: `${defaultSize}px`,
      height: `${defaultSize}px`,
    };
  }

  const sample = telemetry[0];
  const normX = typeof sample.normX === 'number' ? sample.normX : 0.8;
  const normY = typeof sample.normY === 'number' ? sample.normY : 0.72;
  const leftPct = Math.min(isNarrow ? 65 : 80, Math.max(5, normX * 100));
  const topPct = Math.min(isNarrow ? 70 : 75, Math.max(5, normY * 100));
  const sizePx = sample.width ? Math.min(isNarrow ? 120 : 240, Math.max(isNarrow ? 80 : 120, Math.round(sample.width * (isNarrow ? 0.45 : 0.75)))) : defaultSize;

  return {
    left: `${leftPct.toFixed(1)}%`,
    top: `${topPct.toFixed(1)}%`,
    width: `${sizePx}px`,
    height: `${sizePx}px`,
  };
});

const sessionMetadata = computed(() => ({
  sessionId: currentSessionId.value,
  screenPath: activeSession.value?.screenPath,
  cameraRawPath: activeSession.value?.cameraRawPath,
  cameraAlphaPath: activeSession.value?.cameraAlphaPath,
  micAudioPath: activeSession.value?.micAudioPath,
  sysAudioPath: activeSession.value?.sysAudioPath,
  cameraTelemetry: props.cameraTelemetry || [],
  durationMs: Math.round(duration.value * 1000),
}));

const progressPercent = computed(() => {
  if (duration.value <= 0) return 0;
  return Math.min(100, Math.max(0, (currentTime.value / duration.value) * 100));
});

function onScreenLoadedMetadata() {
  const v = screenVideoRef.value;
  if (v) {
    if (v.videoWidth && v.videoHeight) {
      videoNaturalWidth.value = v.videoWidth;
      videoNaturalHeight.value = v.videoHeight;
    }
    if (v.duration && isFinite(v.duration)) {
      duration.value = v.duration;
    }
    hasVideoLoaded.value = true;
  }
}

function onTimeUpdate() {
  const v = screenVideoRef.value;
  if (!v) return;
  currentTime.value = v.currentTime;
  const endSec = (trimEndPct.value / 100) * duration.value;
  if (v.currentTime >= endSec) {
    pausePlayback();
    seekTo((trimStartPct.value / 100) * duration.value);
  }
}

function seekTo(seconds: number) {
  const clamped = Math.max(0, Math.min(duration.value, seconds));
  currentTime.value = clamped;
  if (screenVideoRef.value && hasVideoLoaded.value) {
    screenVideoRef.value.currentTime = clamped;
  }
  if (cameraVideoRef.value && hasCameraVideoLoaded.value) {
    cameraVideoRef.value.currentTime = clamped;
  }
  if (micAudioRef.value) {
    micAudioRef.value.currentTime = clamped;
  }
  if (sysAudioRef.value) {
    sysAudioRef.value.currentTime = clamped;
  }
}

function handleTimelineClick(e: MouseEvent) {
  if (!timelineRef.value) return;
  const rect = timelineRef.value.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  seekTo(pct * duration.value);
}

function togglePlay() {
  if (isPlaying.value) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  isPlaying.value = true;
  if (hasVideoLoaded.value && screenVideoRef.value) {
    screenVideoRef.value.play().catch(() => { });
    cameraVideoRef.value?.play().catch(() => { });
    micAudioRef.value?.play().catch(() => { });
    sysAudioRef.value?.play().catch(() => { });
  } else {
    if (fallbackPlayInterval) clearInterval(fallbackPlayInterval);
    fallbackPlayInterval = setInterval(() => {
      const endSec = (trimEndPct.value / 100) * duration.value;
      if (currentTime.value + 0.1 >= endSec) {
        currentTime.value = (trimStartPct.value / 100) * duration.value;
        pausePlayback();
      } else {
        currentTime.value = Number((currentTime.value + 0.1).toFixed(1));
      }
    }, 100);
  }
}

function pausePlayback() {
  isPlaying.value = false;
  if (fallbackPlayInterval) {
    clearInterval(fallbackPlayInterval);
    fallbackPlayInterval = null;
  }
  screenVideoRef.value?.pause();
  cameraVideoRef.value?.pause();
  micAudioRef.value?.pause();
  sysAudioRef.value?.pause();
}

function handleTrimDeadAir() {
  trimStartPct.value = 6;
  trimEndPct.value = 94;
  seekTo((trimStartPct.value / 100) * duration.value);
  statusNotice.value = 'Trimmed 6% leading & trailing dead air';
  setTimeout(() => {
    statusNotice.value = null;
  }, 3000);
}

async function handleOpenSessionAssets() {
  const sessionDir = activeSession.value?.sessionDir || '';
  const screenPath = activeSession.value?.screenPath || '';
  const dir = sessionDir || (screenPath ? screenPath.replace(/\/[^/]+$/, '') : STUDIO_PROJECTS_DIR);
  const res = await openExportDirectory(dir);
  if (!res.success) {
    navigator.clipboard?.writeText(dir).catch(() => { });
    statusNotice.value = `Session folder path copied: ${dir}`;
    setTimeout(() => {
      statusNotice.value = null;
    }, 4000);
  }
}

async function handleDeleteCurrentSession() {
  const sid = selectedSessionId.value || currentSessionId.value;
  if (!sid) return;
  if (confirm(`Delete recording session "${sid}"? This will delete all media chunks from disk.`)) {
    const success = await deleteSession(sid);
    if (success) {
      statusNotice.value = `Session ${sid} deleted from disk`;
      setTimeout(() => {
        statusNotice.value = null;
      }, 3500);
      selectedSessionId.value = '';
      await loadSessionsList();
    }
  }
}

function formatTime(secs: number) {

  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
}

onMounted(() => {
  loadSessionsList();
  unsubscribeCameraUpload = subscribeToEvent<{ timestamp?: number }>('camera_track_uploaded', async () => {
    await loadSessionsList();
    if (cameraVideoRef.value) {
      cameraVideoRef.value.load();
    }
  });
  unsubscribeSelectSession = subscribeToEvent<{ sessionId?: string }>('select_session', (payload) => {
    if (payload?.sessionId) {
      selectedSessionId.value = payload.sessionId;
    }
  });
});

onUnmounted(() => {
  pausePlayback();
  if (unsubscribeCameraUpload) {
    unsubscribeCameraUpload();
    unsubscribeCameraUpload = null;
  }
  if (unsubscribeSelectSession) {
    unsubscribeSelectSession();
    unsubscribeSelectSession = null;
  }
});
</script>

<template>
  <div class="w-full h-screen flex flex-col bg-[#0B0D13] select-none font-sans overflow-hidden">
    <!-- Top Window Navigation Bar -->
    <div
      class="px-6 py-3.5 flex items-center justify-between border-b border-white/[0.08] bg-[#0E1017] select-none shrink-0">
      <div class="flex items-center space-x-3.5">
        <div
          class="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-studio-crimson shadow-[0_0_12px_rgba(255,59,48,0.2)]">
          <Film class="w-4 h-4" />
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <h2 class="text-sm font-semibold tracking-wide text-white">Studio Review & Export</h2>
            <span
              class="px-2 py-0.5 rounded-md text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              MULTI-TRACK READY
            </span>
          </div>
          <!-- Session Selector Dropdown -->
          <div class="flex items-center gap-2 mt-1">
            <select v-if="sessions.length > 0" v-model="selectedSessionId"
              class="bg-black/60 border border-white/15 rounded-lg px-2 py-0.5 text-xs font-mono text-gray-200 outline-none max-w-xs truncate">
              <option v-for="s in sessions" :key="s.id" :value="s.id" class="bg-[#0e1017]">
                {{ s.id }} ({{ s.chunkCount ? s.chunkCount + ' chunks' : (s.durationMs / 1000).toFixed(0) + 's' }})
              </option>
            </select>
            <span v-else class="text-xs text-gray-400 font-mono">{{ currentSessionId }}</span>
            <button @click="loadSessionsList" class="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"
              title="Refresh Recorded Sessions">
              <RefreshCw class="w-3 h-3" />
            </button>
            <button v-if="sessions.length > 0" @click="handleDeleteCurrentSession"
              class="p-1 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition"
              title="Delete this session from disk">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </div>
    </div>

    <!-- Main Body Area -->
    <div class="flex-1 overflow-y-auto p-6 bg-[#0B0D13]">
      <!-- Tab 1: Review & Cut View -->
      <div class="space-y-6">
        <!-- Synchronized Video Viewport -->
        <div @click="togglePlay" :class="[
          'relative rounded-2xl overflow-hidden bg-[#07080C] border border-white/10 shadow-2xl flex items-center justify-center group cursor-pointer transition-all duration-300',
          viewportClass
        ]" :style="viewportStyle">
          <!-- Real Screen Recording <video> Element -->
          <video v-if="activeSession?.screenUrl" ref="screenVideoRef" :src="activeSession.screenUrl" playsinline
            @loadedmetadata="onScreenLoadedMetadata" @timeupdate="onTimeUpdate" @ended="isPlaying = false"
            class="w-full h-full object-contain transition-transform duration-700" :class="[
              hasVideoLoaded && !isProcessingSession ? 'block' : 'hidden',
              isAutoZoomActive ? 'scale-110 origin-[35%_40%]' : 'scale-100'
            ]" />

          <!-- Synchronized Audio Stems -->
          <audio v-if="activeSession?.micUrl" ref="micAudioRef" :src="activeSession.micUrl" />
          <audio v-if="activeSession?.sysAudioUrl" ref="sysAudioRef" :src="activeSession.sysAudioUrl" />

          <!-- Animated Joining & Finalizing State when video is processing or loading -->
          <div v-if="isProcessingSession || !hasVideoLoaded"
            class="w-full h-full p-8 flex flex-col items-center justify-center bg-gradient-to-br from-[#0c0e17] via-[#101424] to-[#080910] text-center select-none">
            <!-- Glowing Animated Film / Video Loader -->
            <div class="relative mb-5">
              <div
                class="w-16 h-16 rounded-2xl bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center shadow-[0_0_36px_rgba(99,102,241,0.35)]">
                <Film class="w-8 h-8 text-indigo-400 animate-pulse" />
              </div>
              <div
                class="absolute -inset-1.5 rounded-[22px] border-2 border-indigo-500/40 border-t-transparent animate-spin" />
            </div>

            <h3 class="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              <span>{{ isProcessingSession ? 'Joining & Finalizing Recorded Sections' : 'Preparing Synchronized Preview'
              }}</span>
            </h3>
            <p class="text-[11px] text-indigo-200/70 font-mono mt-1 max-w-sm">
              {{ processingStatusMessage ||
                'Merging multi-track screen segments, stitching camera video, and aligning audio stems...'
              }}
            </p>

            <div
              class="flex items-center gap-2 mt-3 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-gray-400">
              <RefreshCw class="w-2.5 h-2.5 animate-spin text-indigo-400" />
              <span>Please wait • Ready in a few moments</span>
            </div>
          </div>

          <!-- Picture-in-Picture Decoupled Camera Track Preview -->
          <div v-if="isCameraPiPVisible && hasCameraTrack && hasVideoLoaded && !isProcessingSession"
            class="absolute aspect-square rounded-[36px] border-2 border-red-500/80 bg-[#161822] shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col items-center justify-center text-white transition-all duration-300"
            :style="pipStyle">
            <video v-if="activeSession?.cameraUrl" ref="cameraVideoRef" :src="activeSession.cameraUrl" muted playsinline
              @loadeddata="hasCameraVideoLoaded = true" class="w-full h-full object-cover"
              :class="hasCameraVideoLoaded ? 'block' : 'hidden'" />
            <template v-if="!hasCameraVideoLoaded">
              <div
                class="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center mb-1.5 shadow-inner">
                <Video class="w-6 h-6 text-indigo-300" />
              </div>
              <span class="text-[11px] font-semibold tracking-wide">Dynamic Facecam PIP</span>
              <span class="text-[9px] text-emerald-400 font-mono mt-0.5">camera_alpha.webm</span>
            </template>
          </div>

          <!-- Auto-Zoom Indicator Badge -->
          <div v-if="isAutoZoomActive && hasVideoLoaded && !isProcessingSession"
            class="absolute top-4 left-4 px-3.5 py-1.5 rounded-full bg-indigo-950/80 border border-indigo-400/40 text-xs font-semibold text-indigo-200 flex items-center space-x-2 backdrop-blur-md shadow-lg">
            <ZoomIn class="w-3.5 h-3.5 text-indigo-300" />
            <span>Screen-Studio Auto-Zoom (Active Preview)</span>
          </div>
        </div>

        <!-- Timeline Scrubber & Trim Handles -->
        <div class="p-5 rounded-2xl glass-card space-y-4 border border-white/[0.08]">
          <div class="flex items-center justify-between text-xs font-mono text-gray-300">
            <div class="flex items-center space-x-2 bg-black/40 px-3 py-1.5 rounded-xl border border-white/5">
              <span class="text-white font-semibold">{{ formatTime(currentTime) }}</span>
              <span class="text-gray-500">/</span>
              <span class="text-gray-400">{{ formatTime(duration) }}</span>
            </div>

            <!-- Aspect Ratio / Preview Size Selector Toolbar -->
            <div class="flex items-center space-x-1 p-1 rounded-xl bg-black/60 border border-white/10 shadow-inner">
              <button @click="previewRatio = '16:9'; isPlayerFullscreen = false;"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                :class="previewRatio === '16:9' && !isPlayerFullscreen ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'"
                title="16:9 Widescreen (Standard Desktop / YouTube)">
                <Monitor class="w-3.5 h-3.5" />
                <span>16:9</span>
              </button>
              <button @click="previewRatio = '9:16'; isPlayerFullscreen = false;"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                :class="previewRatio === '9:16' && !isPlayerFullscreen ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'"
                title="9:16 Vertical (Shorts, Reels, TikTok - video contained)">
                <Smartphone class="w-3.5 h-3.5" />
                <span>9:16</span>
              </button>
              <button @click="previewRatio = 'original'; isPlayerFullscreen = false;"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                :class="previewRatio === 'original' && !isPlayerFullscreen ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'"
                title="Native Display Resolution">
                <Ratio class="w-3.5 h-3.5" />
                <span>Video Size</span>
              </button>
              <button @click="toggleFullscreen"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                :class="isPlayerFullscreen ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'"
                title="Toggle Full Preview Size">
                <Maximize2 class="w-3.5 h-3.5" />
                <span>{{ isPlayerFullscreen ? 'Exit Full' : 'Full Screen' }}</span>
              </button>
            </div>

            <div v-if="statusNotice"
              class="px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs">
              {{ statusNotice }}
            </div>

            <!-- Viewport Toggles -->
            <div class="flex items-center space-x-4">
              <label class="flex items-center space-x-2 cursor-pointer text-gray-300 hover:text-white">
                <input type="checkbox" v-model="isAutoZoomActive" class="rounded accent-indigo-500" />
                <span class="font-sans font-medium text-xs">Simulate Cursor Auto-Zoom</span>
              </label>
              <div class="h-3 w-px bg-white/10" />
              <label :class="[
                'flex items-center space-x-2 text-xs transition',
                hasCameraTrack ? 'cursor-pointer text-gray-300 hover:text-white' : 'opacity-40 cursor-not-allowed text-gray-500'
              ]"
                :title="hasCameraTrack ? 'Toggle Camera PiP Overlay' : 'No camera track was recorded in this session'">
                <input type="checkbox" v-model="isCameraPiPVisible" :disabled="!hasCameraTrack"
                  class="rounded accent-red-500 disabled:opacity-30" />
                <span class="font-sans font-medium">{{ hasCameraTrack ? 'Show Camera PiP' : 'No Camera Track' }}</span>
              </label>
            </div>
          </div>

          <!-- Interactive Waveform & Scrub Track -->
          <div ref="timelineRef" @click="handleTimelineClick"
            class="relative w-full h-10 bg-black/60 rounded-xl overflow-hidden flex items-center cursor-pointer px-1 border border-white/5 shadow-inner">
            <!-- Audio waveform visualization -->
            <div class="absolute inset-0 flex items-center justify-between px-3 opacity-35 pointer-events-none">
              <div v-for="i in 80" :key="i" class="w-1 bg-gradient-to-t from-emerald-500 to-emerald-300 rounded-full"
                :style="{ height: `${25 + (Math.sin(i * 0.4) * 0.5 + 0.5) * 60}%` }" />
            </div>

            <!-- Progress bar fill -->
            <div
              class="absolute left-0 top-0 bottom-0 bg-indigo-500/25 border-r-2 border-indigo-400 pointer-events-none shadow-[0_0_12px_rgba(99,102,241,0.5)]"
              :style="{ width: `${progressPercent}%` }" />

            <!-- Trim In Handle -->
            <div
              class="absolute top-0 bottom-0 w-2.5 bg-amber-400 rounded-l cursor-ew-resize flex items-center justify-center shadow-lg"
              :style="{ left: `${trimStartPct}%` }">
              <div class="w-0.5 h-3 bg-black/70" />
            </div>

            <!-- Trim Out Handle -->
            <div
              class="absolute top-0 bottom-0 w-2.5 bg-amber-400 rounded-r cursor-ew-resize flex items-center justify-center shadow-lg"
              :style="{ left: `calc(${trimEndPct}% - 10px)` }">
              <div class="w-0.5 h-3 bg-black/70" />
            </div>
          </div>

          <!-- Player Controls & Export Bar -->
          <div class="flex items-center justify-between pt-1">
            <div class="flex items-center space-x-3">
              <button @click="togglePlay"
                class="px-4 py-2 bg-white text-black hover:bg-gray-200 rounded-xl transition-all font-semibold text-xs flex items-center space-x-2 shadow-lg active:scale-95">
                <Pause v-if="isPlaying" class="w-3.5 h-3.5 fill-current" />
                <Play v-else class="w-3.5 h-3.5 fill-current" />
                <span>{{ isPlaying ? 'Pause' : 'Play' }}</span>
              </button>

              <button @click="handleTrimDeadAir"
                class="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-gray-200 hover:text-white transition-all border border-white/5">
                <Scissors class="w-3.5 h-3.5 text-amber-400" />
                <span>Trim Dead Air</span>
              </button>
            </div>

            <!-- Export Actions -->
            <div class="flex items-center space-x-3">
              <button @click="handleOpenSessionAssets"
                class="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-gray-200 hover:text-white transition-all border border-white/10">
                <FolderOpen class="w-4 h-4 text-indigo-400" />
                <span>Open Session Assets</span>
              </button>

              <button @click="isExportModalOpen = true"
                class="btn-primary flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-95 cursor-pointer">
                <Download class="w-4 h-4" />
                <span>Export Package</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Export Destination Chooser Modal -->
    <ExportDestinationModal :is-open="isExportModalOpen" :session-id="currentSessionId"
      :session-metadata="sessionMetadata" @close="isExportModalOpen = false" />
  </div>
</template>
