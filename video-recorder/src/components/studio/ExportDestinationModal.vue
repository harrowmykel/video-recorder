<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  Folder,
  FolderOpen,
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
  Check
} from 'lucide-vue-next';
import { getDefaultVideosDirectory, selectExportDirectory, exportSessionPackage, openExportDirectory } from '../../lib/tauriBridge';

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

const exportPath = ref('');
const isExporting = ref(false);
const exportProgress = ref(0);
const isComplete = ref(false);
const isCopied = ref(false);
const openError = ref<string | null>(null);
const exportPreset = ref<'premiere_xml' | 'capcut_draft' | 'mp4_bundle'>('premiere_xml');

// Generate default export path: [videos folder]/record_studio/[date-time]_[session_id]
async function initializeDefaultPath() {
  const baseVideosDir = await getDefaultVideosDirectory();
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  const dateTime = `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
  const sid = props.sessionId || `session_${year}${month}${day}_${hours}${minutes}${seconds}`;
  
  let normalizedBase = baseVideosDir.replace(/[\\/]+$/, '');
  if (!normalizedBase.endsWith('record_studio')) {
    normalizedBase = `${normalizedBase}/record_studio`;
  }
  exportPath.value = `${normalizedBase}/${dateTime}_${sid}`;
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      isExporting.value = false;
      exportProgress.value = 0;
      isComplete.value = false;
      isCopied.value = false;
      openError.value = null;
      initializeDefaultPath();
    }
  },
  { immediate: true }
);

async function handleBrowse() {
  const chosenDir = await selectExportDirectory(exportPath.value);
  if (chosenDir) {
    exportPath.value = chosenDir;
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
    const res = await exportSessionPackage(exportPath.value.trim(), props.sessionMetadata, exportPreset.value);
    clearInterval(timer);
    exportProgress.value = 100;

    if (res.success) {
      isComplete.value = true;
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
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-xl font-sans select-none"
  >
    <div
      class="glass-panel w-full max-w-2xl rounded-3xl overflow-hidden border border-white/10 shadow-[0_32px_96px_rgba(0,0,0,0.95)] flex flex-col bg-[#0E1017]"
    >
      <!-- Modal Header -->
      <div class="px-6 py-4 flex items-center justify-between border-b border-white/[0.08] bg-[#12151F]">
        <div class="flex items-center space-x-3">
          <div class="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
            <Download class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-white tracking-wide">Export Session Package</h3>
            <p class="text-xs text-gray-400 font-mono mt-0.5">Choose export destination & bundle multi-track assets</p>
          </div>
        </div>

        <button
          @click="emit('close')"
          class="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          title="Close"
        >
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
              <input
                v-model="exportPath"
                type="text"
                :disabled="isExporting || isComplete"
                class="w-full pl-10 pr-4 py-2.5 bg-black/50 border border-white/10 rounded-xl text-xs font-mono text-gray-200 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
                placeholder="/path/to/Videos/date-time_session_id"
              />
            </div>
            <button
              @click="handleBrowse"
              :disabled="isExporting || isComplete"
              class="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white transition flex items-center space-x-2 shrink-0 active:scale-95 disabled:opacity-50"
            >
              <FolderOpen class="w-4 h-4 text-indigo-400" />
              <span>Browse...</span>
            </button>
          </div>
          <p class="text-[11px] text-gray-500 font-mono">
            Default: <span class="text-gray-400">[videos folder]/record_studio/[date-time]_[session_id]/***</span>
          </p>
        </div>

        <!-- Preset Selection (Premiere XML vs CapCut Draft vs Raw Bundle) -->
        <div class="space-y-2">
          <label class="block text-xs font-semibold uppercase tracking-wider text-gray-300">
            Package Preset Format
          </label>
          <div class="grid grid-cols-3 gap-2.5">
            <!-- Preset 1: Premiere & DaVinci XML Sync -->
            <div
              @click="exportPreset = 'premiere_xml'"
              :class="[
                'p-3 rounded-2xl border cursor-pointer transition flex flex-col justify-between',
                exportPreset === 'premiere_xml'
                  ? 'bg-indigo-600/20 border-indigo-400/60 text-white shadow-lg shadow-indigo-950/40'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/15 text-gray-400 hover:text-gray-200'
              ]"
            >
              <div class="flex items-center space-x-2 mb-1.5">
                <Layers class="w-4 h-4 text-indigo-400 shrink-0" />
                <span class="text-xs font-bold block text-white truncate">Premiere & DaVinci</span>
              </div>
              <span class="text-[10px] text-gray-400 leading-snug block">
                Standard XMEML timeline with facecam motion position keyframes + stems.
              </span>
            </div>

            <!-- Preset 2: CapCut Draft & PIP Sync -->
            <div
              @click="exportPreset = 'capcut_draft'"
              :class="[
                'p-3 rounded-2xl border cursor-pointer transition flex flex-col justify-between',
                exportPreset === 'capcut_draft'
                  ? 'bg-sky-600/20 border-sky-400/60 text-white shadow-lg shadow-sky-950/40'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/15 text-gray-400 hover:text-gray-200'
              ]"
            >
              <div class="flex items-center space-x-2 mb-1.5">
                <Sparkles class="w-4 h-4 text-sky-400 shrink-0" />
                <span class="text-xs font-bold block text-white truncate">CapCut Draft Sync</span>
              </div>
              <span class="text-[10px] text-gray-400 leading-snug block">
                CapCut Desktop draft_content.json with PIP camera placement + stems.
              </span>
            </div>

            <!-- Preset 3: Full Raw Asset Archive -->
            <div
              @click="exportPreset = 'mp4_bundle'"
              :class="[
                'p-3 rounded-2xl border cursor-pointer transition flex flex-col justify-between',
                exportPreset === 'mp4_bundle'
                  ? 'bg-emerald-600/20 border-emerald-400/60 text-white shadow-lg shadow-emerald-950/40'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/15 text-gray-400 hover:text-gray-200'
              ]"
            >
              <div class="flex items-center space-x-2 mb-1.5">
                <FileVideo class="w-4 h-4 text-emerald-400 shrink-0" />
                <span class="text-xs font-bold block text-white truncate">Raw Asset Archive</span>
              </div>
              <span class="text-[10px] text-gray-400 leading-snug block">
                Clean MP4 + isolated facecam + separate WAV stems + JSON telemetry.
              </span>
            </div>
          </div>
        </div>

        <!-- Package Manifest Assets Preview -->
        <div class="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-2.5">
          <span class="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
            Package Manifest Included Tracks
          </span>
          <div class="grid grid-cols-2 gap-2 text-xs font-mono text-gray-300">
            <div class="flex items-center space-x-2">
              <FileVideo class="w-3.5 h-3.5 text-indigo-400" />
              <span>screen_clean.mp4 (60fps)</span>
            </div>
            <div class="flex items-center space-x-2">
              <FileVideo class="w-3.5 h-3.5 text-rose-400" />
              <span>camera_raw.mp4 (1080p)</span>
            </div>
            <div class="flex items-center space-x-2">
              <Sparkles class="w-3.5 h-3.5 text-amber-400" />
              <span>camera_alpha.webm (Transparent PIP)</span>
            </div>
            <div class="flex items-center space-x-2">
              <FileAudio class="w-3.5 h-3.5 text-emerald-400" />
              <span>audio_mic.wav (48kHz 24-bit)</span>
            </div>
            <div class="flex items-center space-x-2">
              <FileAudio class="w-3.5 h-3.5 text-cyan-400" />
              <span>audio_system.wav (Loopback)</span>
            </div>
            <div v-if="exportPreset === 'premiere_xml'" class="flex items-center space-x-2">
              <FileCode class="w-3.5 h-3.5 text-purple-400" />
              <span>project_sync.xml (Premiere/DaVinci)</span>
            </div>
            <div v-else-if="exportPreset === 'capcut_draft'" class="flex items-center space-x-2">
              <FileCode class="w-3.5 h-3.5 text-sky-400" />
              <span>draft_content.json (CapCut PIP)</span>
            </div>
            <div v-else class="flex items-center space-x-2">
              <FileCode class="w-3.5 h-3.5 text-purple-400" />
              <span>telemetry_camera.json (Position/Scale)</span>
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
            <div
              class="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-200"
              :style="{ width: `${exportProgress}%` }"
            />
          </div>
        </div>

        <!-- Success Message on Completion -->
        <div
          v-if="isComplete"
          class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col space-y-2.5"
        >
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
              <button
                @click="handleOpenPath"
                class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 shadow-sm"
                title="Open export folder in system file manager"
              >
                <FolderOpen class="w-3.5 h-3.5 text-indigo-400" />
                <span>Open Folder</span>
              </button>

              <!-- Copy Path Action -->
              <button
                @click="handleCopyPath"
                class="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 shadow-sm"
              >
                <component :is="isCopied ? Check : Copy" class="w-3.5 h-3.5" />
                <span>{{ isCopied ? 'Copied' : 'Copy Path' }}</span>
              </button>
            </div>
          </div>

          <div v-if="openError" class="text-[11px] text-amber-300 font-mono bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
            Note: {{ openError }}
          </div>
        </div>
      </div>

      <!-- Modal Footer Actions -->
      <div class="px-6 py-4 flex items-center justify-between border-t border-white/[0.08] bg-[#12151F]">
        <button
          @click="emit('close')"
          class="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-gray-300 hover:text-white transition"
        >
          {{ isComplete ? 'Close' : 'Cancel' }}
        </button>

        <button
          v-if="!isComplete"
          @click="handleStartExport"
          :disabled="isExporting || !exportPath.trim()"
          class="btn-primary px-6 py-2 rounded-xl text-xs font-bold text-white flex items-center space-x-2 transition shadow-lg active:scale-95 disabled:opacity-50"
        >
          <Loader2 v-if="isExporting" class="w-4 h-4 animate-spin" />
          <Download v-else class="w-4 h-4" />
          <span>{{ isExporting ? 'Exporting Package...' : 'Confirm & Export' }}</span>
        </button>

        <button
          v-else
          @click="emit('close')"
          class="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition shadow-lg active:scale-95"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>
