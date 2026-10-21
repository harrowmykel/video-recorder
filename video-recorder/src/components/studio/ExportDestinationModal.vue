<script setup lang="ts">
import { shallowRef, computed, watch, onUnmounted } from 'vue';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  AlertTriangle,
  CheckCircle2,
  Download,
  X,
  FileVideo,
  FileAudio,
  FileCode,
  Layers,
  Sparkles,
  Loader2,
  Copy,
  Check,
  GripVertical
} from 'lucide-vue-next';
import {
  getDefaultExportsDirectory,
  selectExportDirectory,
  exportSessionPackage,
  openExportDirectory,
  checkDirectoryNotEmpty,
  deleteSession,
  moveOverlayWindow,
  isNativeOverlayWindow,
} from '@/lib/tauriBridge';


type ExportPresetType = 'single_mp4' | 'remotion_video' | 'mp4_bundle';

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    sessionId?: string;
    sessionMetadata?: Record<string, any>;
  }>(),
  {
    isOpen: false,
    sessionId: 'session_20261017_143245',
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'exported', targetDir: string): void;
}>();

const hasCameraTrack = computed(() => {
  const meta = props.sessionMetadata;
  if (!meta) return true;
  if (typeof meta.cameraRawPath === 'string') {
    return meta.cameraRawPath.trim().length > 0;
  }
  return true;
});

const exportPath = shallowRef('');
const baseSessionExportPath = shallowRef('');
const isExporting = shallowRef(false);
const exportProgress = shallowRef(0);
const isComplete = shallowRef(false);
const hasSavedPackage = shallowRef(false);
const isCopied = shallowRef(false);
const openError = shallowRef<string | null>(null);
const folderNotEmptyAlert = shallowRef<string | null>(null);
const exportPreset = shallowRef<ExportPresetType>('single_mp4');
const deleteSessionOnDone = shallowRef(false);
const includeCameraPip = shallowRef(true);

function handleExportAnother() {
  isComplete.value = false;
  hasSavedPackage.value = true;
  openError.value = null;
}

async function handleDone() {
  if (deleteSessionOnDone.value && props.sessionId) {
    await deleteSession(props.sessionId);
  }
  emit('close');
}


async function buildDefaultExportPath(preset: ExportPresetType = exportPreset.value): Promise<string> {
  const exportsBase = await getDefaultExportsDirectory();
  const rawUuid = (props.sessionId || 'master').replace(/^session_/, '');
  return `${exportsBase}/sess_${preset}_${rawUuid}`;
}

// Generate default export path: [videos path]/studio/exports/sess_[format]_[uuid]
async function initializeDefaultPath() {
  const generated = await buildDefaultExportPath(exportPreset.value);
  baseSessionExportPath.value = generated;
  exportPath.value = generated;
  await validateFolderEmptyState(generated, false);
}

async function validateFolderEmptyState(pathToCheck: string, showBrowserAlert: boolean) {
  const trimmed = pathToCheck.trim();
  if (!trimmed) {
    folderNotEmptyAlert.value = null;
    return false;
  }
  const status = await checkDirectoryNotEmpty(trimmed);
  if (status.notEmpty) {
    const msg = `Folder is not empty: "${trimmed}" already contains ${status.fileCount || 'exported'} files. You can create a new folder or export into this folder.`;
    folderNotEmptyAlert.value = msg;
    if (showBrowserAlert && typeof window !== 'undefined') {
      window.alert(`Folder is not empty!\n\nDestination "${trimmed}" already contains exported files. You can click "Create New Folder" or proceed to export the new preset format.`);
    }
    return true;
  } else {
    folderNotEmptyAlert.value = null;
    return false;
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      isExporting.value = false;
      exportProgress.value = 0;
      isComplete.value = false;
      hasSavedPackage.value = false;
      isCopied.value = false;
      openError.value = null;
      folderNotEmptyAlert.value = null;
      includeCameraPip.value = true;
      initializeDefaultPath();
    }
  },
  { immediate: true }
);

async function handleSelectPreset(newPreset: ExportPresetType) {
  if (isExporting.value) return;
  const previousPreset = exportPreset.value;
  exportPreset.value = newPreset;

  const newDefaultPath = await buildDefaultExportPath(newPreset);
  exportPath.value = newDefaultPath;

  if (previousPreset !== newPreset && (isComplete.value || hasSavedPackage.value)) {
    // Allow new export creation when preset format changes after saving
    isComplete.value = false;
    exportProgress.value = 0;
    await validateFolderEmptyState(newDefaultPath, true);
  } else if (previousPreset !== newPreset) {
    await validateFolderEmptyState(newDefaultPath, false);
  }
}

async function handleCreateNewFolderForPreset() {
  const exportsBase = await getDefaultExportsDirectory();
  const rawUuid = (props.sessionId || 'master').replace(/^session_/, '');
  const now = new Date();
  const timeTag = `${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
  const newDir = `${exportsBase}/sess_${exportPreset.value}_${rawUuid}_${timeTag}`;
  exportPath.value = newDir;
  isComplete.value = false;
  exportProgress.value = 0;
  folderNotEmptyAlert.value = null;
}

async function handlePathInputChange() {
  if (isComplete.value) {
    isComplete.value = false;
    exportProgress.value = 0;
  }
  await validateFolderEmptyState(exportPath.value, false);
}

async function handleBrowse() {
  const chosenDir = await selectExportDirectory(exportPath.value);
  if (chosenDir) {
    exportPath.value = chosenDir;
    isComplete.value = false;
    exportProgress.value = 0;
    await validateFolderEmptyState(chosenDir, true);
  }
}

async function handleStartExport() {
  if (!exportPath.value.trim() || isExporting.value) return;

  isExporting.value = true;
  exportProgress.value = 15;

  const timer = setInterval(() => {
    if (exportProgress.value < 85) {
      exportProgress.value += Math.round(15 + Math.random() * 20);
    }
  }, 200);

  try {
    const safeMeta = props.sessionMetadata
      ? JSON.parse(JSON.stringify(props.sessionMetadata))
      : {};
    safeMeta.includeCameraPip = includeCameraPip.value;
    const res = await exportSessionPackage(exportPath.value.trim(), safeMeta, exportPreset.value, {
      includeCameraPip: includeCameraPip.value,
    });
    clearInterval(timer);
    exportProgress.value = 100;

    if (res.success) {
      isComplete.value = true;
      hasSavedPackage.value = true;
      folderNotEmptyAlert.value = null;
      emit('exported', exportPath.value.trim());
    } else {
      alert(`Export failed: ${res.error || 'Unknown error'}`);
    }
  } catch (err: any) {
    clearInterval(timer);
    alert(`Export error: ${err?.message || err}`);
  } finally {
    isExporting.value = false;
  }
}

function handleCopyPath() {
  navigator.clipboard.writeText(exportPath.value);
  isCopied.value = true;
  setTimeout(() => {
    isCopied.value = false;
  }, 2000);
}

async function handleOpenPath() {
  openError.value = null;
  const res = await openExportDirectory(exportPath.value);
  if (!res.success && res.error) {
    openError.value = res.error;
    setTimeout(() => {
      openError.value = null;
    }, 4000);
  }
}

// Dragging logic for frameless window & modal repositioning
let isPointerDown = false;
let isDraggingWindow = false;
let startScreenX = 0;
let startScreenY = 0;
let lastScreenX = 0;
let lastScreenY = 0;

const modalOffsetX = shallowRef(0);
const modalOffsetY = shallowRef(0);

const modalOffsetStyle = computed(() => {
  if (!isNativeOverlayWindow() && (modalOffsetX.value || modalOffsetY.value)) {
    return {
      transform: `translate(${modalOffsetX.value}px, ${modalOffsetY.value}px)`,
    };
  }
  return {};
});

function onDragMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (target?.closest('button, input, select, a, [data-no-drag]')) return;
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
  if (!isDraggingWindow && totalDx + totalDy > 3) {
    isDraggingWindow = true;
  }
  if (!isDraggingWindow) return;
  const dx = e.screenX - lastScreenX;
  const dy = e.screenY - lastScreenY;
  lastScreenX = e.screenX;
  lastScreenY = e.screenY;

  if (isNativeOverlayWindow()) {
    moveOverlayWindow('studio', dx, dy);
  } else {
    modalOffsetX.value += dx;
    modalOffsetY.value += dy;
  }
}

function onDragMouseUp() {
  isPointerDown = false;
  isDraggingWindow = false;
  window.removeEventListener('mousemove', onDragMouseMove);
  window.removeEventListener('mouseup', onDragMouseUp);
}

onUnmounted(() => {
  onDragMouseUp();
});
</script>

<template>
  <div v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-xl font-sans select-none">
    <div :style="modalOffsetStyle"
      class="glass-panel w-full max-w-2xl rounded-3xl overflow-hidden border border-white/10 shadow-[0_32px_96px_rgba(0,0,0,0.95)] flex flex-col bg-[#0E1017]">
      <!-- Modal Header (Draggable) -->
      <div @mousedown="onDragMouseDown"
        class="px-6 py-4 flex items-center justify-between border-b border-white/[0.08] bg-[#12151F] cursor-grab active:cursor-grabbing select-none">
        <div class="flex items-center space-x-3 pointer-events-none">
          <GripVertical class="w-4 h-4 text-white/30 shrink-0" />
          <div class="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
            <Download class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-white tracking-wide">Export Session Package</h3>
            <p class="text-xs text-gray-400 font-mono mt-0.5">Choose export destination & bundle multi-track assets</p>
          </div>
        </div>

        <button @click="emit('close')"
          class="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors" title="Close">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 space-y-6 bg-[#0A0C13]">
        <!-- Destination Chooser Form -->
        <div class="space-y-2">
          <label class="block text-xs font-semibold uppercase tracking-wider text-gray-300">
            Export Destination Directory
          </label>
          <div class="flex items-center space-x-2">
            <div class="relative flex-1">
              <Folder class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input v-model="exportPath" type="text" :disabled="isExporting" @input="handlePathInputChange"
                class="w-full pl-10 pr-4 py-2.5 bg-black/50 border border-white/10 rounded-xl text-xs font-mono text-gray-200 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
                placeholder="/path/to/Videos/studio/exports/sess_format_uuid" />
            </div>
            <button @click="handleBrowse" :disabled="isExporting"
              class="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white transition flex items-center space-x-2 shrink-0 active:scale-95 disabled:opacity-50">
              <FolderOpen class="w-4 h-4 text-indigo-400" />
              <span>Browse...</span>
            </button>
          </div>
          <p class="text-[11px] text-gray-500 font-mono">
            Default: <span class="text-gray-400">[videos path]/studio/exports/sess_[format]_[uuid]</span>
          </p>

          <!-- Folder Not Empty Alert Banner -->
          <div v-if="folderNotEmptyAlert"
            class="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-between gap-3 text-amber-200">
            <div class="flex items-start gap-2.5 text-xs">
              <AlertTriangle class="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span class="font-bold text-amber-300 block">Folder is not empty</span>
                <span class="text-[11px] text-amber-200/90 leading-snug block">{{ folderNotEmptyAlert }}</span>
              </div>
            </div>
            <button @click="handleCreateNewFolderForPreset"
              class="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition active:scale-95"
              title="Generate a new clean folder for this preset">
              <FolderPlus class="w-3.5 h-3.5 text-amber-300" />
              <span>Create New Folder</span>
            </button>
          </div>
        </div>

        <!-- Preset Selection (Single MP4 vs Remotion Video vs Raw Bundle) -->
        <div class="space-y-2">
          <label class="block text-xs font-semibold uppercase tracking-wider text-gray-300">
            Package Preset Format
          </label>
          <div class="grid grid-cols-3 gap-2.5">
            <!-- Preset 1: Single MP4 (Full Assembled) -->
            <div @click="handleSelectPreset('single_mp4')" :class="[
              'p-3 rounded-2xl border cursor-pointer transition flex flex-col justify-between',
              exportPreset === 'single_mp4'
                ? 'bg-indigo-600/20 border-indigo-400/60 text-white shadow-lg shadow-indigo-950/40'
                : 'bg-white/[0.02] border-white/5 hover:border-white/15 text-gray-400 hover:text-gray-200'
            ]">
              <div class="flex items-center space-x-2 mb-1.5">
                <FileVideo class="w-4 h-4 text-indigo-400 shrink-0" />
                <span class="text-xs font-bold block text-white truncate">Single Video (MP4)</span>
              </div>
              <span class="text-[10px] text-gray-400 leading-snug block">
                Assembled MP4 with screen, camera PiP, and mixed audio stems ready to share.
              </span>
            </div>

            <!-- Preset 2: Remotion Video (React Project) -->
            <div @click="handleSelectPreset('remotion_video')" :class="[
              'p-3 rounded-2xl border cursor-pointer transition flex flex-col justify-between',
              exportPreset === 'remotion_video'
                ? 'bg-violet-600/20 border-violet-400/60 text-white shadow-lg shadow-violet-950/40'
                : 'bg-white/[0.02] border-white/5 hover:border-white/15 text-gray-400 hover:text-gray-200'
            ]">
              <div class="flex items-center space-x-2 mb-1.5">
                <FileCode class="w-4 h-4 text-violet-400 shrink-0" />
                <span class="text-xs font-bold block text-white truncate">Remotion Video</span>
              </div>
              <span class="text-[10px] text-gray-400 leading-snug block">
                React Remotion project with multi-track Sequences, telemetry, and Agent skills.
              </span>
            </div>

            <!-- Preset 3: Full Raw Asset Archive -->
            <div @click="handleSelectPreset('mp4_bundle')" :class="[
              'p-3 rounded-2xl border cursor-pointer transition flex flex-col justify-between',
              exportPreset === 'mp4_bundle'
                ? 'bg-emerald-600/20 border-emerald-400/60 text-white shadow-lg shadow-emerald-950/40'
                : 'bg-white/[0.02] border-white/5 hover:border-white/15 text-gray-400 hover:text-gray-200'
            ]">
              <div class="flex items-center space-x-2 mb-1.5">
                <Layers class="w-4 h-4 text-emerald-400 shrink-0" />
                <span class="text-xs font-bold block text-white truncate">Raw Asset Archive</span>
              </div>
              <span class="text-[10px] text-gray-400 leading-snug block">
                Consolidated take files, clean screen MP4, separate WAV stems, and telemetry JSON.
              </span>
            </div>
          </div>

          <!-- Options for Single MP4: Camera PiP Toggle -->
          <div v-if="exportPreset === 'single_mp4'" class="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
            <label class="flex items-center space-x-3 cursor-pointer select-none">
              <input type="checkbox" v-model="includeCameraPip" class="w-4 h-4 rounded bg-white/10 border-white/20 text-indigo-500 accent-indigo-500 cursor-pointer" />
              <div>
                <span class="text-xs font-semibold text-white block">Overlay Camera PiP Track</span>
                <span class="text-[11px] text-gray-400 block">Uncheck if camera bubble was already captured directly on screen (e.g. Linux).</span>
              </div>
            </label>
          </div>
        </div>

        <!-- Package Manifest Assets Preview -->
        <div class="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-2.5">
          <span class="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
            Package Manifest Included Tracks
          </span>
          <div class="grid grid-cols-2 gap-2 text-xs font-mono text-gray-300">
            <div v-if="exportPreset === 'single_mp4'" class="flex items-center space-x-2 col-span-2">
              <FileVideo class="w-3.5 h-3.5 text-indigo-400" />
              <span>single_recording.mp4 (Full multi-track composited 60fps{{ includeCameraPip ? ' with Camera PiP' : ' without PiP' }})</span>
            </div>
            <div v-else-if="exportPreset === 'remotion_video'" class="flex items-center space-x-2">
              <FileCode class="w-3.5 h-3.5 text-violet-400" />
              <span>Composition.tsx & sessionData.ts</span>
            </div>
            <div v-else class="flex items-center space-x-2">
              <Layers class="w-3.5 h-3.5 text-emerald-400" />
              <span>takes/ (Screen, Camera & Audio takes)</span>
            </div>

            <div v-if="exportPreset === 'remotion_video'" class="flex items-center space-x-2">
              <Sparkles class="w-3.5 h-3.5 text-amber-400" />
              <span>public/takes/ (Consolidated media)</span>
            </div>
            <div v-else-if="exportPreset !== 'single_mp4'" class="flex items-center space-x-2">
              <FileVideo class="w-3.5 h-3.5 text-indigo-400" />
              <span>screen_take_*.mp4 (60fps)</span>
            </div>

            <div v-if="hasCameraTrack && exportPreset !== 'single_mp4'" class="flex items-center space-x-2">
              <Sparkles class="w-3.5 h-3.5 text-rose-400" />
              <span>camera_take_*.webm (Transparent PiP)</span>
            </div>

            <div v-if="exportPreset === 'remotion_video'" class="flex items-center space-x-2">
              <FileCode class="w-3.5 h-3.5 text-emerald-400" />
              <span>.agents/skills/ (Remotion AI Skills)</span>
            </div>
            <div v-else-if="exportPreset !== 'single_mp4'" class="flex items-center space-x-2">
              <FileAudio class="w-3.5 h-3.5 text-emerald-400" />
              <span>audio_mic_take_*.wav (48kHz 24-bit)</span>
            </div>

            <div class="flex items-center space-x-2">
              <FileCode class="w-3.5 h-3.5 text-purple-400" />
              <span>package_manifest.json (Metadata)</span>
            </div>

            <div v-if="hasCameraTrack && exportPreset !== 'single_mp4'" class="flex items-center space-x-2">
              <FileCode class="w-3.5 h-3.5 text-sky-400" />
              <span>telemetry_camera.json (Keyframes)</span>
            </div>
          </div>
        </div>

        <!-- Progress Bar if exporting -->
        <div v-if="isExporting" class="space-y-1.5">
          <div class="flex justify-between text-xs font-mono text-gray-400">
            <span class="flex items-center gap-1.5">
              <Loader2 class="w-3.5 h-3.5 animate-spin text-indigo-400" />
              Exporting synchronized package...
            </span>
            <span class="text-white font-bold">{{ exportProgress }}%</span>
          </div>
          <div class="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div class="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-200"
              :style="{ width: `${exportProgress}%` }" />
          </div>
        </div>

        <!-- Success Message on Completion -->
        <div v-if="isComplete"
          class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col space-y-2.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <CheckCircle2 class="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <span class="text-xs font-bold text-white block">Package Export Complete!</span>
                <span class="text-[11px] text-emerald-200 font-mono truncate max-w-sm block">
                  Saved to: {{ exportPath }}
                </span>
              </div>
            </div>
            <div class="flex items-center space-x-2">
              <!-- Open Path / Open Folder Action -->
              <button @click="handleOpenPath"
                class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 shadow-sm"
                title="Open export folder in system file manager">
                <FolderOpen class="w-3.5 h-3.5 text-indigo-400" />
                <span>Open Folder</span>
              </button>

              <!-- Copy Path Action -->
              <button @click="handleCopyPath"
                class="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 shadow-sm">
                <component :is="isCopied ? Check : Copy" class="w-3.5 h-3.5" />
                <span>{{ isCopied ? 'Copied' : 'Copy Path' }}</span>
              </button>
            </div>
          </div>

          <div v-if="openError"
            class="text-[11px] text-amber-300 font-mono bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
            Note: {{ openError }}
          </div>
        </div>
      </div>

      <!-- Modal Footer Actions -->
      <div class="px-6 py-4 flex items-center justify-between border-t border-white/[0.08] bg-[#12151F]">
        <div v-if="isComplete" class="flex items-center space-x-2">
          <label class="flex items-center space-x-2 text-xs text-gray-400 hover:text-white cursor-pointer select-none">
            <input type="checkbox" v-model="deleteSessionOnDone"
              class="w-4 h-4 rounded bg-white/10 border-white/20 text-rose-500 focus:ring-rose-500/30 accent-rose-500 cursor-pointer" />
            <span :class="deleteSessionOnDone ? 'text-rose-300 font-medium' : 'text-gray-400'">
              Delete session cache files on Done
            </span>
          </label>
        </div>
        <button v-else @click="emit('close')"
          class="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-gray-300 hover:text-white transition">
          Cancel
        </button>

        <div class="flex items-center space-x-2.5">
          <button v-if="isComplete" @click="handleExportAnother"
            class="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-gray-200 hover:text-white transition active:scale-95 shadow-sm">
            Export Another Preset
          </button>

          <button v-if="!isComplete" @click="handleStartExport" :disabled="isExporting || !exportPath.trim()"
            class="btn-primary px-6 py-2 rounded-xl text-xs font-bold text-white flex items-center space-x-2 transition shadow-lg active:scale-95 disabled:opacity-50">
            <Loader2 v-if="isExporting" class="w-4 h-4 animate-spin" />
            <Download v-else class="w-4 h-4" />
            <span>{{ isExporting ? 'Exporting Package...' : 'Confirm & Export' }}</span>
          </button>

          <button v-else @click="handleDone"
            class="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition shadow-lg active:scale-95">
            Done
          </button>
        </div>
      </div>

    </div>
  </div>
</template>
