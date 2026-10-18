<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, useTemplateRef } from 'vue';
import {
  Wifi,
  BatteryCharging,
  Palette,
  Video,
  Mic,
  Monitor,
  AppWindow,
  Crop,
  Sparkles,
  Upload,
  Sliders,
  Layers,
  Film,
  Check,
  RefreshCw,
  Minimize2,
  Maximize2,
  Link2,
  Eye,
  EyeOff,
  VideoOff,
  FolderArchive,
  FolderOpen,
  Trash2,
  Play,
  Clock,
  Calendar,
  Search,
  Download,
  Copy,
  HardDrive
} from 'lucide-vue-next';
import FloatingToolbar from '../toolbar/FloatingToolbar.vue';
import CameraBubble from '../camera/CameraBubble.vue';
import DragDropBgRemover from '../studio/DragDropBgRemover.vue';
import StudioReviewModal from '../studio/StudioReviewModal.vue';
import ExportDestinationModal from '../studio/ExportDestinationModal.vue';
import { useTheme } from '../../composables/useTheme';
import { THEME_LIST, StudioTheme } from '../../themes';
import { useStudioState } from '../../composables/useStudioState';
import { useMediaDevices } from '../../composables/useMediaDevices';
import {
  fetchCaptureSources,
  fetchRecordedSessions,
  deleteSession,
  getDefaultVideosDirectory,
  openExportDirectory,
  isNativeOverlayWindow
} from '../../lib/tauriBridge';
import type { DisplaySourceInfo, WindowSourceInfo, RecordingSession } from '../../types/studio';

function handleSelectTheme(themeId: StudioTheme) {
  setTheme(themeId);
}

const props = defineProps<{
  initialSection?: 'workspace' | 'settings' | 'backgrounds' | 'ai_studio' | 'sessions';
  audioVolume: number;
}>();

const emit = defineEmits<{
  (e: 'toggleCamera'): void;
  (e: 'toggleDock'): void;
  (e: 'toggleAnnotation'): void;
  (e: 'toggleLiveZoom'): void;
  (e: 'openReviewModal'): void;
  (e: 'openAreaPicker'): void;
}>();

const { currentTheme, setTheme } = useTheme();
const {
  recordingState,
  isCameraHidden,
  isDockedToCamera,
  isAnnotationActive,
  isLiveZoomActive,
  isToolbarCollapsed,
  captureSourceMode,
  selectedDisplayId,
  selectedWindowId,
  selectedWindowTitle,
  captureArea,
  targetFps,
  selectedCameraId,
  selectedMicId,
  isMicMuted,
  isSysAudioMuted,
  cameraShape,
  cameraSize,
  cameraCustomDiameter,
  isCameraMirrored,
  bgMode,
  bgImageUrl,
  bgPresets,
  setCustomBgImageFromFile,
} = useStudioState();

const { cameras, microphones, liveMicLevel, refreshDevices, startMicMeter } = useMediaDevices();

const isNativeWindow = isNativeOverlayWindow();
const activeSection = shallowRef<'workspace' | 'settings' | 'backgrounds' | 'ai_studio' | 'sessions'>(
  props.initialSection || (isNativeWindow ? 'settings' : 'workspace')
);
const displays = ref<DisplaySourceInfo[]>([]);
const windows = ref<WindowSourceInfo[]>([]);
const isLoadingSources = shallowRef(false);
const bgUploadInput = useTemplateRef<HTMLInputElement>('bgUploadInput');

// Sessions Management Reactive State
const sessionsList = ref<RecordingSession[]>([]);
const isLoadingSessions = shallowRef(false);
const sessionSearchQuery = shallowRef('');
const projectsBaseDir = shallowRef('~/Videos/studio/projects');
const copiedSessionId = shallowRef<string | null>(null);
const sessionActionNotice = shallowRef<string | null>(null);

const reviewModalSession = shallowRef<RecordingSession | null>(null);
const isReviewModalOpen = shallowRef(false);

const exportModalSession = shallowRef<RecordingSession | null>(null);
const isExportModalOpen = shallowRef(false);

async function loadSessions() {
  isLoadingSessions.value = true;
  try {
    sessionsList.value = await fetchRecordedSessions();
  } finally {
    isLoadingSessions.value = false;
  }
}

const filteredSessions = computed(() => {
  const q = sessionSearchQuery.value.trim().toLowerCase();
  if (!q) return sessionsList.value;
  return sessionsList.value.filter((s) => {
    return (
      s.id.toLowerCase().includes(q) ||
      s.timestamp.toLowerCase().includes(q) ||
      (s.status && s.status.toLowerCase().includes(q))
    );
  });
});

function formatTimestamp(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function handleOpenProjectsFolder() {
  const res = await openExportDirectory(projectsBaseDir.value);
  if (!res.success) {
    navigator.clipboard?.writeText(projectsBaseDir.value).catch(() => {});
    sessionActionNotice.value = `Projects path copied: ${projectsBaseDir.value}`;
    setTimeout(() => { sessionActionNotice.value = null; }, 3500);
  }
}

async function handleOpenSpecificSessionFolder(session: RecordingSession) {
  const targetPath = session.sessionDir || (session.screenPath ? session.screenPath.replace(/\/[^/]+$/, '') : `${projectsBaseDir.value}/${session.id}`);
  const res = await openExportDirectory(targetPath);
  if (!res.success) {
    navigator.clipboard?.writeText(targetPath).catch(() => {});
    sessionActionNotice.value = `Session folder copied: ${targetPath}`;
    setTimeout(() => { sessionActionNotice.value = null; }, 3500);
  }
}

function copySessionId(id: string) {
  navigator.clipboard?.writeText(id).catch(() => {});
  copiedSessionId.value = id;
  setTimeout(() => { copiedSessionId.value = null; }, 2000);
}

async function handleDeleteSession(session: RecordingSession) {
  if (!confirm(`Delete project session "${session.id}"?\n\nThis will remove all recorded chunks and manifest files from disk. This action cannot be undone.`)) {
    return;
  }
  const ok = await deleteSession(session.id);
  if (ok) {
    sessionsList.value = sessionsList.value.filter((s) => s.id !== session.id);
    sessionActionNotice.value = `Session ${session.id} deleted`;
    setTimeout(() => { sessionActionNotice.value = null; }, 3000);
  } else {
    alert('Could not delete session. Please check file permissions.');
  }
}

function openSessionReview(session: RecordingSession) {
  reviewModalSession.value = session;
  isReviewModalOpen.value = true;
}

function openSessionExport(session: RecordingSession) {
  exportModalSession.value = session;
  isExportModalOpen.value = true;
}

async function loadSources() {
  isLoadingSources.value = true;
  try {
    const res = await fetchCaptureSources();
    displays.value = res.displays;
    windows.value = res.windows;
  } finally {
    isLoadingSources.value = false;
  }
}

async function handleBgImageFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    await setCustomBgImageFromFile(file);
  }
}

async function handleBgDrop(e: DragEvent) {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('image/')) {
    await setCustomBgImageFromFile(file);
  }
}

onMounted(() => {
  const path = window.location.pathname.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const tabParam = searchParams.get('tab');
  const winParam = searchParams.get('window');
  if (
    winParam === 'settings' ||
    path.includes('setting') ||
    path.includes('app') ||
    tabParam === 'settings'
  ) {
    activeSection.value = 'settings';
  } else if (tabParam === 'backgrounds') {
    activeSection.value = 'backgrounds';
  } else if (tabParam === 'sessions') {
    activeSection.value = 'sessions';
  }
  refreshDevices(false);
  loadSources();
  getDefaultVideosDirectory().then((dir) => {
    if (dir) {
      projectsBaseDir.value = dir;
    }
  });
  loadSessions();
});
</script>

<template>
  <div class="relative w-full h-full bg-[#08090E] flex flex-col justify-between overflow-hidden">
    <!-- Ambient Studio Lighting Glows -->
    <div class="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-[128px] pointer-events-none" />
    <div class="absolute -bottom-40 -right-40 w-96 h-96 bg-red-600/15 rounded-full blur-[128px] pointer-events-none" />
    <div
      class="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),transparent_70%)] pointer-events-none" />

    <!-- Top Navigation & Control Header -->
    <header
      class="z-30 px-6 py-2.5 flex items-center justify-between border-b border-white/[0.08] bg-[#0A0C14]/90 backdrop-blur-md">
      <div class="flex items-center space-x-4">
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 rounded-full bg-studio-crimson shadow-[0_0_8px_#FF3B30]" />
          <span class="text-xs font-bold tracking-wider text-white">STUDIO RECORDER</span>
        </div>
        <div class="h-4 w-px bg-white/10" />

        <!-- Interactive Navigation Tabs -->
        <nav class="flex items-center space-x-1.5 text-xs font-medium">
          <button v-if="!isNativeWindow && props.initialSection !== 'settings'" @click="activeSection = 'workspace'"
            :class="[
              'px-3 py-1.5 rounded-xl transition flex items-center gap-1.5',
              activeSection === 'workspace'
                ? 'bg-white/10 text-white font-semibold border border-white/15'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            ]">
            <Layers class="w-3.5 h-3.5 text-indigo-400" />
            <span>Workspace</span>
          </button>

          <button @click="activeSection = 'sessions'; loadSessions();" :class="[
            'px-3 py-1.5 rounded-xl transition flex items-center gap-1.5',
            activeSection === 'sessions'
              ? 'bg-white/10 text-white font-semibold border border-white/15'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          ]">
            <FolderArchive class="w-3.5 h-3.5 text-cyan-400" />
            <span>Sessions</span>
            <span v-if="sessionsList.length > 0"
              class="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              {{ sessionsList.length }}
            </span>
          </button>

          <button @click="activeSection = 'settings'; refreshDevices(true); loadSources();" :class="[
            'px-3 py-1.5 rounded-xl transition flex items-center gap-1.5',
            activeSection === 'settings'
              ? 'bg-white/10 text-white font-semibold border border-white/15'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          ]">
            <Sliders class="w-3.5 h-3.5 text-rose-400" />
            <span>Settings & Devices</span>
          </button>

          <button @click="activeSection = 'backgrounds'" :class="[
            'px-3 py-1.5 rounded-xl transition flex items-center gap-1.5',
            activeSection === 'backgrounds'
              ? 'bg-white/10 text-white font-semibold border border-white/15'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          ]">
            <Sparkles class="w-3.5 h-3.5 text-amber-400" />
            <span>Real-Time BG</span>
          </button>

          <button @click="activeSection = 'ai_studio'" :class="[
            'px-3 py-1.5 rounded-xl transition flex items-center gap-1.5',
            activeSection === 'ai_studio'
              ? 'bg-white/10 text-white font-semibold border border-white/15'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          ]">
            <Film class="w-3.5 h-3.5 text-emerald-400" />
            <span>AI Batch Studio</span>
          </button>
        </nav>
      </div>

      <!-- Right Action Controls -->
      <div class="flex items-center space-x-2.5 text-xs">
        <div
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/5 font-mono text-gray-300">
          <span class="text-gray-500">SOURCE:</span>
          <span class="font-semibold text-emerald-300 uppercase">{{ captureSourceMode }}</span>
        </div>

        <div
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/5 font-mono text-gray-300">
          <span class="text-gray-500">STATE:</span>
          <span class="font-semibold text-white uppercase">{{ recordingState }}</span>
        </div>

        <button @click="emit('openReviewModal')"
          class="px-3 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-400/30 text-indigo-300 font-semibold transition-all shadow-sm active:scale-95">
          Review & Export
        </button>


        <div class="hidden lg:flex items-center space-x-2 text-gray-400 pl-1">
          <Wifi class="w-3.5 h-3.5" />
          <BatteryCharging class="w-3.5 h-3.5 text-emerald-400" />
        </div>
      </div>
    </header>

    <!-- SECTION 1: Interactive Workspace Preview -->
    <main v-if="activeSection === 'workspace'" class="flex-1 flex items-center justify-center relative p-8">
      <!-- Central Desktop Info Card -->
      <div class="text-center max-w-lg z-0 opacity-75 space-y-3">
        <div
          class="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-gray-300">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Active Target: {{ selectedWindowTitle }} ({{ captureArea.width }}×{{ captureArea.height }})</span>
        </div>
        <h2 class="text-3xl font-extrabold text-white tracking-tight">
          Screen & Camera Studio
        </h2>
        <p class="text-xs text-gray-400 leading-relaxed">
          Use the floating toolbar below or open <strong>Settings & Devices</strong> / <strong>Real-Time BG</strong> in
          the top bar to switch cameras, pick screen/window/area targets, or apply custom background images in real
          time.
        </p>
        <div class="flex items-center justify-center gap-2 pt-2">
          <button @click="activeSection = 'settings'"
            class="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition">
            Configure Devices & Capture Source
          </button>
          <button @click="activeSection = 'backgrounds'"
            class="px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-xs font-semibold text-rose-200 transition flex items-center gap-1.5">
            <Sparkles class="w-3.5 h-3.5" />
            <span>Change Camera Background Image</span>
          </button>
        </div>
      </div>

      <!-- Floating Camera Bubble (Draggable preview) -->
      <div class="transition-all duration-300 z-10" :class="[
        isDockedToCamera
          ? 'flex flex-col items-center space-y-12'
          : 'absolute bottom-20 right-16'
      ]">
        <CameraBubble :is-hidden="isCameraHidden" :audio-volume="props.audioVolume"
          :is-recording="recordingState === 'recording'" @hide="isCameraHidden = true" />

        <!-- Docked Toolbar if Satellite mode is enabled -->
        <FloatingToolbar v-if="isDockedToCamera" v-model:recording-state="recordingState"
          :is-camera-hidden="isCameraHidden" :is-docked-to-camera="isDockedToCamera"
          :is-annotation-active="isAnnotationActive" :is-live-zoom-active="isLiveZoomActive"
          @toggle-camera="emit('toggleCamera')" @toggle-dock="emit('toggleDock')"
          @toggle-annotation="emit('toggleAnnotation')" @toggle-live-zoom="emit('toggleLiveZoom')"
          @open-settings-modal="activeSection = 'settings'" @open-area-picker="emit('openAreaPicker')" />
      </div>

      <!-- Free-Floating Toolbar when not docked -->
      <div v-if="!isDockedToCamera" class="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
        <FloatingToolbar v-model:recording-state="recordingState" :is-camera-hidden="isCameraHidden"
          :is-docked-to-camera="isDockedToCamera" :is-annotation-active="isAnnotationActive"
          :is-live-zoom-active="isLiveZoomActive" @toggle-camera="emit('toggleCamera')"
          @toggle-dock="emit('toggleDock')" @toggle-annotation="emit('toggleAnnotation')"
          @toggle-live-zoom="emit('toggleLiveZoom')" @open-settings-modal="activeSection = 'settings'"
          @open-area-picker="emit('openAreaPicker')" />
      </div>
    </main>

    <!-- SECTION 2: Settings & Devices Control Center (localhost:1420 /app & /settings) -->
    <main v-else-if="activeSection === 'settings'" class="flex-1 overflow-y-auto p-6 md:p-8 z-20">
      <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Column 1: Capture Source (Display, Window, Area) -->
        <div class="p-5 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-xl space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Monitor class="w-4 h-4" />
              </div>
              <div>
                <h3 class="text-sm font-bold text-white">1. Screen Capture Source</h3>
                <p class="text-[11px] text-white/50">Select Display, Window, or Custom Area</p>
              </div>
            </div>
            <button @click="loadSources"
              class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
              title="Refresh Displays & Windows">
              <RefreshCw class="w-3.5 h-3.5" :class="isLoadingSources ? 'animate-spin' : ''" />
            </button>
          </div>

          <!-- Source Mode Switcher -->
          <div class="grid grid-cols-3 gap-2">
            <button @click="captureSourceMode = 'display'" :class="[
              'py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition',
              captureSourceMode === 'display'
                ? 'bg-rose-500 text-white border-rose-400 shadow'
                : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
            ]">
              <Monitor class="w-3.5 h-3.5" />
              <span>Display</span>
            </button>
            <button @click="captureSourceMode = 'window'; loadSources()" :class="[
              'py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition',
              captureSourceMode === 'window'
                ? 'bg-indigo-500 text-white border-indigo-400 shadow'
                : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
            ]">
              <AppWindow class="w-3.5 h-3.5" />
              <span>Window</span>
            </button>
            <button @click="captureSourceMode = 'area'" :class="[
              'py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition',
              captureSourceMode === 'area'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow font-bold'
                : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
            ]">
              <Crop class="w-3.5 h-3.5" />
              <span>Area</span>
            </button>
          </div>

          <!-- Displays List -->
          <div v-if="captureSourceMode === 'display'" class="space-y-2">
            <span class="text-[10px] font-mono uppercase text-white/40 block">Available Monitors</span>
            <button v-for="d in displays" :key="d.id"
              @click="selectedDisplayId = d.id; selectedWindowTitle = d.name; captureArea = { x: d.x, y: d.y, width: d.width, height: d.height }"
              :class="[
                'w-full p-3 rounded-2xl text-left border flex items-center justify-between transition',
                selectedDisplayId === d.id
                  ? 'bg-rose-500/15 border-rose-400/50 text-white'
                  : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
              ]">
              <div>
                <div class="text-xs font-semibold">{{ d.name }}</div>
                <div class="text-[10px] font-mono text-white/50">{{ d.width }} × {{ d.height }} • Offset +{{ d.x }}+{{
                  d.y }}</div>
              </div>
              <Check v-if="selectedDisplayId === d.id" class="w-4 h-4 text-rose-400" />
            </button>
          </div>

          <!-- Windows List -->
          <div v-else-if="captureSourceMode === 'window'" class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            <span class="text-[10px] font-mono uppercase text-white/40 block">Open Desktop Windows ({{ windows.length
              }})</span>
            <button v-for="w in windows" :key="w.id"
              @click="selectedWindowId = w.id; selectedWindowTitle = w.title; captureArea = { x: w.x, y: w.y, width: w.width, height: w.height }"
              :class="[
                'w-full p-2.5 rounded-xl text-left border flex items-center justify-between transition',
                selectedWindowId === w.id
                  ? 'bg-indigo-500/20 border-indigo-400/50 text-white'
                  : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
              ]">
              <div class="min-w-0 pr-2">
                <div class="text-xs font-semibold truncate">{{ w.title }}</div>
                <div class="text-[10px] font-mono text-white/50">{{ w.appName }} • {{ w.width }}×{{ w.height }}</div>
              </div>
              <Check v-if="selectedWindowId === w.id" class="w-4 h-4 text-indigo-400 shrink-0" />
            </button>
          </div>

          <!-- Area Coordinates & Interactive Picker -->
          <div v-else class="space-y-3">
            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="text-[10px] font-mono text-white/50 uppercase block mb-1">X Offset</label>
                <input v-model.number="captureArea.x" type="number"
                  class="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white" />
              </div>
              <div>
                <label class="text-[10px] font-mono text-white/50 uppercase block mb-1">Y Offset</label>
                <input v-model.number="captureArea.y" type="number"
                  class="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white" />
              </div>
              <div>
                <label class="text-[10px] font-mono text-white/50 uppercase block mb-1">Width (px)</label>
                <input v-model.number="captureArea.width" type="number" step="2"
                  class="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white" />
              </div>
              <div>
                <label class="text-[10px] font-mono text-white/50 uppercase block mb-1">Height (px)</label>
                <input v-model.number="captureArea.height" type="number" step="2"
                  class="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white" />
              </div>
            </div>

            <button @click="emit('openAreaPicker')"
              class="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition">
              <Crop class="w-4 h-4" />
              <span>Interactive Screen Region Selector</span>
            </button>
          </div>

          <!-- Frame Rate Setting -->
          <div class="pt-3 border-t border-white/10 flex items-center justify-between">
            <span class="text-xs text-white/70 font-medium">Target Frame Rate</span>
            <div class="flex items-center gap-1.5">
              <button @click="targetFps = 30"
                :class="['px-3 py-1 rounded-lg text-xs font-mono font-bold transition', targetFps === 30 ? 'bg-white text-black' : 'bg-white/5 text-white/60']">
                30 FPS
              </button>
              <button @click="targetFps = 60"
                :class="['px-3 py-1 rounded-lg text-xs font-mono font-bold transition', targetFps === 60 ? 'bg-white text-black' : 'bg-white/5 text-white/60']">
                60 FPS
              </button>
            </div>
          </div>
        </div>

        <!-- Column 2: Camera & Audio Input Devices -->
        <div class="p-5 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-xl space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Video class="w-4 h-4" />
              </div>
              <div>
                <h3 class="text-sm font-bold text-white">2. Camera & Audio Devices</h3>
                <p class="text-[11px] text-white/50">Hardware input selection & levels</p>
              </div>
            </div>
            <button @click="refreshDevices(true)"
              class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
              title="Rescan Hardware Devices">
              <RefreshCw class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Camera Device List -->
          <div class="space-y-1.5">
            <label class="text-[10px] font-mono uppercase text-white/50 block">Active Camera Device</label>
            <div class="space-y-1.5">
              <!-- Dedicated No Camera (Screen Only) Option -->
              <button @click="selectedCameraId = 'none'; isCameraHidden = true" :class="[
                'w-full px-3.5 py-2.5 rounded-xl text-left text-xs flex items-center justify-between border transition',
                selectedCameraId === 'none'
                  ? 'bg-rose-500/20 border-rose-400/50 text-white font-semibold'
                  : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
              ]">
                <div class="flex items-center gap-2.5 truncate pr-2">
                  <VideoOff class="w-4 h-4 text-rose-400 shrink-0" />
                  <span class="truncate">No Camera (Screen Only)</span>
                </div>
                <Check v-if="selectedCameraId === 'none'" class="w-4 h-4 text-rose-400 shrink-0" />
              </button>

              <button v-for="cam in cameras" :key="cam.deviceId"
                @click="selectedCameraId = cam.deviceId; isCameraHidden = false" :class="[
                  'w-full px-3.5 py-2.5 rounded-xl text-left text-xs flex items-center justify-between border transition',
                  selectedCameraId === cam.deviceId
                    ? 'bg-indigo-500/20 border-indigo-400/50 text-white font-semibold'
                    : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
                ]">
                <div class="flex items-center gap-2.5 truncate pr-2">
                  <Video class="w-4 h-4 text-indigo-400 shrink-0" />
                  <span class="truncate">{{ cam.label }}</span>
                </div>
                <Check v-if="selectedCameraId === cam.deviceId" class="w-4 h-4 text-indigo-400 shrink-0" />
              </button>
            </div>
          </div>

          <!-- Microphone Device List -->
          <div class="space-y-1.5 pt-2">
            <label class="text-[10px] font-mono uppercase text-white/50 block">Microphone Input</label>
            <div class="space-y-1.5">
              <button v-for="mic in microphones" :key="mic.deviceId"
                @click="selectedMicId = mic.deviceId; isMicMuted = false; startMicMeter(mic.deviceId)" :class="[
                  'w-full px-3.5 py-2.5 rounded-xl text-left text-xs flex items-center justify-between border transition',
                  selectedMicId === mic.deviceId
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-white font-semibold'
                    : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
                ]">
                <span class="truncate pr-2">{{ mic.label }}</span>
                <Check v-if="selectedMicId === mic.deviceId" class="w-4 h-4 text-emerald-400 shrink-0" />
              </button>
            </div>
          </div>

          <!-- Live Mic Level Meter & Mute Controls -->
          <div class="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-2.5">
            <div class="flex items-center justify-between text-xs">
              <span class="text-white/70 flex items-center gap-1.5">
                <Mic class="w-3.5 h-3.5 text-emerald-400" />
                <span>Mic Input Gain</span>
              </span>
              <button @click="isMicMuted = !isMicMuted"
                :class="['px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition', isMicMuted ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300']">
                {{ isMicMuted ? 'Muted' : 'Active' }}
              </button>
            </div>
            <div class="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <div class="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all duration-100"
                :style="{ width: isMicMuted ? '0%' : `${Math.max(12, Math.round((liveMicLevel || props.audioVolume) * 100))}%` }" />
            </div>

            <div class="flex items-center justify-between text-xs pt-1">
              <span class="text-white/70">System Desktop Audio Loopback</span>
              <button @click="isSysAudioMuted = !isSysAudioMuted"
                :class="['px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition', isSysAudioMuted ? 'bg-white/10 text-white/40' : 'bg-sky-500/20 text-sky-300']">
                {{ isSysAudioMuted ? 'Disabled' : 'Enabled' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Column 3: Toolbar, Overlays & Theme Controls -->
        <div class="p-5 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-xl space-y-4">
          <div class="flex items-center gap-2.5">
            <div
              class="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Palette class="w-4 h-4" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-white">3. Overlays & Themes</h3>
              <p class="text-[11px] text-white/50">Minimize toolbars, dock controls & themes</p>
            </div>
          </div>

          <!-- Quick Overlay Window Actions -->
          <div class="grid grid-cols-1 gap-2">
            <button @click="isToolbarCollapsed = !isToolbarCollapsed"
              class="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-xs text-white transition">
              <span class="flex items-center gap-2 font-semibold">
                <component :is="isToolbarCollapsed ? Maximize2 : Minimize2" class="w-4 h-4 text-rose-400" />
                <span>{{ isToolbarCollapsed ? 'Expand Floating Toolbar' : 'Minimize Floating Toolbar' }}</span>
              </span>
              <span class="px-2 py-0.5 rounded bg-white/10 text-[10px] font-mono">
                {{ isToolbarCollapsed ? 'MINIMIZED' : 'EXPANDED' }}
              </span>
            </button>

            <button @click="isCameraHidden = !isCameraHidden"
              class="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-xs text-white transition">
              <span class="flex items-center gap-2 font-semibold">
                <component :is="isCameraHidden ? Eye : EyeOff" class="w-4 h-4 text-indigo-400" />
                <span>{{ isCameraHidden ? 'Show Camera Bubble' : 'Hide Camera Bubble' }}</span>
              </span>
              <span class="px-2 py-0.5 rounded bg-white/10 text-[10px] font-mono">
                {{ isCameraHidden ? 'HIDDEN' : 'VISIBLE' }}
              </span>
            </button>

            <button @click="isDockedToCamera = !isDockedToCamera"
              class="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-xs text-white transition">
              <span class="flex items-center gap-2 font-semibold">
                <Link2 class="w-4 h-4 text-emerald-400" />
                <span>Satellite Dock Toolbar to Camera</span>
              </span>
              <span class="px-2 py-0.5 rounded bg-white/10 text-[10px] font-mono">
                {{ isDockedToCamera ? 'DOCKED' : 'FREE' }}
              </span>
            </button>
          </div>

          <!-- Theme Switcher Grid -->
          <!-- <div class="space-y-2 pt-1">
            <span class="text-[10px] font-mono uppercase text-white/50 block">Studio Visual Theme</span>
            <div class="grid grid-cols-2 gap-2">
              <button v-for="t in THEME_LIST" :key="t.id" @click="setTheme(t.id)" :class="[
                'p-3 rounded-2xl border text-left transition',
                currentTheme === t.id
                  ? 'bg-white/15 border-white/40 text-white font-bold shadow'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
              ]">
                <div class="text-xs font-bold truncate">{{ t.name }}</div>
                <div class="text-[10px] text-white/50 truncate mt-0.5">{{ t.badge }}</div>
              </button>
            </div>
          </div> -->
        </div>

        <div class="p-5 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-xl space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Monitor class="w-4 h-4" />
              </div>
              <div>
                <h3 class="text-sm font-bold text-white">Studio Theme & Appearance</h3>
                <p class="text-[11px] text-white/50">Select your preferred desktop overlay design aesthetic</p>
              </div>
            </div>
          </div>

          <!-- Theme Cards Grid -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-y-auto">
            <div v-for="t in THEME_LIST" :key="t.id" @click="handleSelectTheme(t.id)" :class="[
              'relative p-2 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between group',
              currentTheme === t.id
                ? 'border-white/40 bg-white/10 ring-2 ring-offset-2 ring-offset-[#0e111a] shadow-xl'
                : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]'
            ]" :style="currentTheme === t.id ? { borderColor: t.accentColor } : {}">
              <!-- Active Check Indicator -->
              <div v-if="currentTheme === t.id"
                class="absolute top-3.5 right-3.5 w-6 h-6 rounded-full flex items-center justify-center shadow"
                :style="{ backgroundColor: t.accentColor }">
                <Check class="w-3.5 h-3.5 text-black stroke-[3]" />
              </div>

              <div>
                <!-- Badge & Tagline -->
                <div class="flex items-center gap-2 mb-2">
                  <span
                    :class="['px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border', t.badgeClass]">
                    {{ t.badge }}
                  </span>
                </div>

                <h4 class="text-sm font-bold text-white group-hover:text-white/90">
                  {{ t.name }}
                </h4>
                <div class="text-[11px] font-medium text-white/50 mb-2">
                  {{ t.tagline }}
                </div>
                <p class="text-xs text-white/60 leading-relaxed mb-4">
                  {{ t.description }}
                </p>
              </div>

              <!-- Color Swatch Strip -->
              <div class="flex items-center gap-1.5 pt-3 border-t border-white/5">
                <span v-for="(c, idx) in t.previewColors" :key="idx"
                  class="w-5 h-5 rounded-md shadow-inner border border-white/10" :style="{ backgroundColor: c }"></span>
                <span class="text-[10px] font-mono text-white/40 ml-auto">
                  {{ currentTheme === t.id ? 'ACTIVE' : 'SELECT' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div
            class="px-6 py-4 border-t border-white/10 bg-black/40 flex items-center justify-between text-xs text-white/50">
            <span>Themes update all floating overlay windows in real time</span>
          </div>

        </div>
      </div>
    </main>

    <!-- SECTION 3: Real-Time Camera Background Studio (Custom Image / Blur / Cutout) -->
    <main v-else-if="activeSection === 'backgrounds'" @dragover.prevent @drop="handleBgDrop"
      class="flex-1 overflow-y-auto p-6 md:p-8 z-20">
      <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <!-- Left 7 Cols: Background Mode, Custom Image Upload, Presets & Camera Geometry -->
        <div class="lg:col-span-7 p-6 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-2xl space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-base font-bold text-white flex items-center gap-2">
                <Sparkles class="w-5 h-5 text-rose-400" />
                <span>Real-Time Camera Background Replacement</span>
              </h3>
              <p class="text-xs text-white/50 mt-0.5">
                Replace your webcam background in real time with any custom image, studio preset, blur, or alpha cutout
              </p>
            </div>
          </div>

          <!-- 5 Background Modes -->
          <div class="space-y-2">
            <label class="text-[11px] font-mono uppercase text-white/50 block">Background Mode</label>
            <div class="grid grid-cols-5 gap-2">
              <button v-for="mode in (['off', 'blur', 'transparent', 'image', 'gradient'] as const)" :key="mode"
                @click="bgMode = mode" :class="[
                  'py-2.5 px-3 rounded-xl text-xs font-semibold capitalize border transition',
                  bgMode === mode
                    ? 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/20'
                    : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
                ]">
                {{ mode === 'transparent' ? 'Cutout' : mode }}
              </button>
            </div>
          </div>

          <!-- Upload Custom Image Zone -->
          <div class="space-y-2">
            <label class="text-[11px] font-mono uppercase text-white/50 block">Custom Background Image</label>
            <div @click="bgUploadInput?.click()"
              class="p-5 rounded-2xl border-2 border-dashed border-indigo-400/30 hover:border-indigo-400/70 bg-indigo-500/5 hover:bg-indigo-500/10 cursor-pointer transition flex items-center justify-between">
              <div class="flex items-center gap-3.5">
                <div
                  class="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <Upload class="w-5 h-5" />
                </div>
                <div>
                  <div class="text-xs font-bold text-white">Upload or Drag & Drop Any Image</div>
                  <div class="text-[11px] text-white/50">Supports PNG, JPG, WebP, SVG • Applied immediately in real time
                  </div>
                </div>
              </div>
              <span class="px-3.5 py-1.5 rounded-xl bg-indigo-500 text-white text-xs font-semibold shadow">
                Choose Image...
              </span>
              <input ref="bgUploadInput" type="file" accept="image/*" class="hidden"
                @change="handleBgImageFileChange" />
            </div>
          </div>

          <!-- Studio Preset Backdrops -->
          <div class="space-y-2">
            <label class="text-[11px] font-mono uppercase text-white/50 block">Studio Background Presets</label>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button v-for="preset in bgPresets" :key="preset.id"
                @click="bgMode = preset.type; if (preset.type === 'image') bgImageUrl = preset.value;"
                class="h-20 rounded-2xl border border-white/15 hover:border-white/60 overflow-hidden relative group transition shadow-lg"
                :style="{ background: preset.thumbnail }">
                <div class="absolute inset-0 bg-black/20 group-hover:bg-transparent transition" />
                <span
                  class="absolute inset-x-0 bottom-0 bg-black/75 text-[10px] text-white font-semibold py-1 px-2 truncate">
                  {{ preset.name }}
                </span>
              </button>
            </div>
          </div>

          <!-- Camera Shape, Size & Mirror Controls -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-white/10">
            <div>
              <label class="text-[10px] font-mono uppercase text-white/50 block mb-1.5">Camera Shape</label>
              <div class="grid grid-cols-3 gap-1.5">
                <button v-for="sh in (['circle', 'squircle', 'rect16_9'] as const)" :key="sh" @click="cameraShape = sh"
                  :class="['py-1.5 rounded-lg text-xs font-semibold border transition', cameraShape === sh ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/70']">
                  {{ sh === 'rect16_9' ? '16:9' : sh }}
                </button>
              </div>
            </div>

            <div>
              <label class="text-[10px] font-mono uppercase text-white/50 block mb-1.5">Size Preset</label>
              <div class="grid grid-cols-4 gap-1.5">
                <button v-for="sz in (['S', 'M', 'L', 'fullscreen'] as const)" :key="sz"
                  @click="cameraCustomDiameter = null; cameraSize = sz"
                  :class="['py-1.5 rounded-lg text-xs font-bold border transition', cameraSize === sz && !cameraCustomDiameter ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/70']">
                  {{ sz === 'fullscreen' ? 'XL' : sz }}
                </button>
              </div>
            </div>

            <div>
              <label class="text-[10px] font-mono uppercase text-white/50 block mb-1.5">Mirror Video</label>
              <button @click="isCameraMirrored = !isCameraMirrored"
                :class="['w-full py-1.5 rounded-lg text-xs font-semibold border transition', isCameraMirrored ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300' : 'bg-white/5 border-white/10 text-white/60']">
                {{ isCameraMirrored ? 'Mirrored (Horizontal Flip)' : 'Normal (Unmirrored)' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Right 5 Cols: Live Interactive Camera Bubble Preview -->
        <div
          class="lg:col-span-5 p-6 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-2xl flex flex-col items-center justify-center min-h-[420px] space-y-5">
          <div class="text-xs font-mono uppercase tracking-wider text-white/50">
            Live Real-Time Camera Preview <span v-if="selectedCameraId !== 'none'">(Mode: <span
                class="text-rose-400 font-bold">{{ bgMode }}</span>)</span>
          </div>

          <template v-if="selectedCameraId !== 'none'">
            <CameraBubble :is-hidden="false" :audio-volume="props.audioVolume"
              :is-recording="recordingState === 'recording'" @hide="isCameraHidden = true" />

            <p class="text-[11px] text-white/40 text-center max-w-xs">
              Hover over the camera frame above to test quick resize, shape morphing, or custom background image upload.
            </p>
          </template>

          <template v-else>
            <div class="flex flex-col items-center justify-center text-center p-8 space-y-4 max-w-sm">
              <div
                class="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-950/40">
                <VideoOff class="w-8 h-8" />
              </div>
              <div class="space-y-1">
                <h4 class="text-sm font-bold text-white">Camera Recording Disabled</h4>
                <p class="text-xs text-white/60 leading-relaxed">
                  Recordings will capture clean screen and audio without a facecam overlay track.
                </p>
              </div>
              <button @click="selectedCameraId = cameras[0]?.deviceId || 'default'; isCameraHidden = false;"
                class="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-2 shadow-lg transition">
                <Video class="w-3.5 h-3.5" />
                <span>Turn Camera On</span>
              </button>
            </div>
          </template>
        </div>
      </div>
    </main>

    <!-- SECTION 4: AI Batch Background Remover Studio -->
    <main v-else-if="activeSection === 'ai_studio'" class="flex-1 overflow-y-auto p-6 md:p-8 z-20">
      <div class="max-w-5xl mx-auto">
        <DragDropBgRemover />
      </div>
    </main>

    <!-- SECTION 5: Undeleted Project Sessions Browser -->
    <main v-else-if="activeSection === 'sessions'" class="flex-1 overflow-y-auto p-6 md:p-8 z-20">
      <div class="max-w-6xl mx-auto space-y-6">
        <!-- Header Banner with Base Directory -->
        <div class="p-6 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl relative overflow-hidden">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div class="flex items-center gap-2.5">
                <div class="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <FolderArchive class="w-5 h-5" />
                </div>
                <div>
                  <h2 class="text-base font-bold text-white tracking-wide">Recorded Sessions & Projects</h2>
                  <p class="text-xs text-gray-400 mt-0.5">
                    Pre-export multi-track buffer sessions saved locally. Sessions are kept until manually deleted.
                  </p>
                </div>
              </div>
            </div>

            <!-- Path Pill & Open Folder Action -->
            <div class="flex items-center gap-2 flex-wrap">
              <div class="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-gray-300">
                <HardDrive class="w-3.5 h-3.5 text-cyan-400" />
                <span class="text-gray-400">Path:</span>
                <span class="text-white select-all">{{ projectsBaseDir }}</span>
              </div>
              <button
                @click="handleOpenProjectsFolder"
                class="px-3.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-200 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
              >
                <FolderOpen class="w-3.5 h-3.5" />
                <span>Open Folder</span>
              </button>
            </div>
          </div>

          <!-- Search and Filter Bar -->
          <div class="mt-5 pt-4 border-t border-white/[0.08] flex items-center justify-between gap-4 flex-wrap">
            <div class="relative flex-1 min-w-[260px] max-w-md">
              <Search class="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                v-model="sessionSearchQuery"
                type="text"
                placeholder="Search sessions by UUID or date..."
                class="w-full pl-9 pr-3 py-2 bg-black/50 border border-white/10 rounded-xl text-xs text-gray-200 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 placeholder:text-gray-600 transition"
              />
            </div>

            <div class="flex items-center space-x-2">
              <span class="text-xs text-gray-400">
                Total: <strong class="text-white">{{ filteredSessions.length }}</strong>
                <span v-if="filteredSessions.length !== sessionsList.length"> (of {{ sessionsList.length }})</span>
              </span>
              <button
                @click="loadSessions"
                :disabled="isLoadingSessions"
                class="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-gray-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw :class="['w-3.5 h-3.5', isLoadingSessions ? 'animate-spin text-cyan-400' : '']" />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <!-- Optional Notice Banner -->
          <div
            v-if="sessionActionNotice"
            class="mt-4 p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 text-xs font-medium flex items-center gap-2"
          >
            <Check class="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{{ sessionActionNotice }}</span>
          </div>
        </div>

        <!-- Sessions List Cards -->
        <div v-if="filteredSessions.length === 0 && !isLoadingSessions" class="p-12 text-center rounded-3xl bg-white/[0.02] border border-white/5 space-y-3">
          <div class="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-gray-500">
            <FolderArchive class="w-6 h-6" />
          </div>
          <h3 class="text-sm font-semibold text-white">No recording sessions found</h3>
          <p class="text-xs text-gray-400 max-w-sm mx-auto">
            {{ sessionSearchQuery ? 'No sessions match your search query.' : 'Recorded sessions will appear here automatically once you record in the Studio.' }}
          </p>
        </div>

        <div v-else class="grid grid-cols-1 gap-4">
          <div
            v-for="session in filteredSessions"
            :key="session.id"
            class="p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 hover:border-white/20 transition-all shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <!-- Left Info Column -->
            <div class="space-y-2.5 flex-1 min-w-0">
              <div class="flex items-center gap-2.5 flex-wrap">
                <!-- Status Badge -->
                <span
                  v-if="session.status === 'recording'"
                  class="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                  Recording
                </span>
                <span
                  v-else
                  class="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Ready
                </span>

                <!-- Session ID with Copy -->
                <button
                  @click="copySessionId(session.id)"
                  class="group flex items-center gap-1.5 font-mono text-xs font-semibold text-white hover:text-cyan-300 transition"
                  title="Click to copy Session ID"
                >
                  <span>{{ session.id }}</span>
                  <Check v-if="copiedSessionId === session.id" class="w-3.5 h-3.5 text-emerald-400" />
                  <Copy v-else class="w-3.5 h-3.5 text-gray-500 group-hover:text-cyan-400 transition" />
                </button>

                <!-- Creation Timestamp -->
                <div class="flex items-center gap-1 text-[11px] text-gray-400">
                  <Calendar class="w-3.5 h-3.5 text-gray-500" />
                  <span>{{ formatTimestamp(session.timestamp) }}</span>
                </div>

                <!-- Duration Badge -->
                <div class="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-black/40 border border-white/5 text-[11px] font-mono text-gray-300">
                  <Clock class="w-3 h-3 text-indigo-400" />
                  <span>{{ formatDuration(session.durationMs) }}</span>
                </div>
              </div>

              <!-- Tracks & Manifest Badges -->
              <div class="flex items-center gap-2 flex-wrap text-xs">
                <!-- Screen track -->
                <span
                  :class="[
                    'px-2 py-0.5 rounded-md text-[11px] font-medium flex items-center gap-1 border',
                    session.screenPath
                      ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                      : 'bg-white/5 text-gray-500 border-white/5'
                  ]"
                >
                  <Monitor class="w-3 h-3" />
                  <span>Screen Clean</span>
                </span>

                <!-- Camera track -->
                <span
                  :class="[
                    'px-2 py-0.5 rounded-md text-[11px] font-medium flex items-center gap-1 border',
                    session.cameraRawPath
                      ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                      : 'bg-white/5 text-gray-500 border-white/5'
                  ]"
                >
                  <Video v-if="session.cameraRawPath" class="w-3 h-3" />
                  <VideoOff v-else class="w-3 h-3" />
                  <span>{{ session.cameraRawPath ? 'Camera Raw' : 'No Camera' }}</span>
                </span>

                <!-- Audio track -->
                <span
                  class="px-2 py-0.5 rounded-md text-[11px] font-medium flex items-center gap-1 bg-amber-500/10 text-amber-300 border border-amber-500/20"
                >
                  <Mic class="w-3 h-3" />
                  <span>Mic & Sys Audio</span>
                </span>

                <!-- Chunk buffer count -->
                <span
                  v-if="session.chunkCount !== undefined"
                  class="px-2 py-0.5 rounded-md text-[11px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 flex items-center gap-1"
                >
                  <Layers class="w-3 h-3" />
                  <span>{{ session.chunkCount }} chunks</span>
                </span>

                <!-- Location path preview -->
                <span
                  class="text-[11px] text-gray-500 font-mono truncate max-w-xs cursor-pointer hover:text-gray-300"
                  @click="handleOpenSpecificSessionFolder(session)"
                  :title="session.sessionDir || session.screenPath"
                >
                  {{ (session.sessionDir || session.screenPath).replace(/.*\/studio\/projects\//, '.../projects/') }}
                </span>
              </div>
            </div>

            <!-- Right Actions Buttons -->
            <div class="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/5">
              <button
                @click="openSessionReview(session)"
                class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md transition active:scale-95"
                title="Review and play recorded session"
              >
                <Play class="w-3.5 h-3.5 fill-current" />
                <span>Review</span>
              </button>

              <button
                @click="openSessionExport(session)"
                class="px-3.5 py-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
                title="Export session to Premiere XML, CapCut, or MP4 bundle"
              >
                <Download class="w-3.5 h-3.5" />
                <span>Export</span>
              </button>

              <button
                @click="handleOpenSpecificSessionFolder(session)"
                class="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-300 hover:text-white transition active:scale-95"
                title="Show session folder in file manager"
              >
                <FolderOpen class="w-4 h-4 text-cyan-400" />
              </button>

              <button
                @click="handleDeleteSession(session)"
                class="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 hover:text-red-300 transition active:scale-95"
                title="Delete session folder from disk"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Review Modal inside StudioDashboardView -->
    <StudioReviewModal
      v-if="isReviewModalOpen"
      :initial-session-id="reviewModalSession?.id"
      @close="isReviewModalOpen = false; loadSessions();"
    />

    <!-- Export Modal inside StudioDashboardView -->
    <ExportDestinationModal
      :is-open="isExportModalOpen"
      :session-id="exportModalSession?.id"
      :session-metadata="exportModalSession || undefined"
      @close="isExportModalOpen = false; loadSessions();"
    />
  </div>
</template>
