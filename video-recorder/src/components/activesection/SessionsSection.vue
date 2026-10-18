<script setup lang="ts">
import { shallowRef, computed } from 'vue';
import {
  FolderArchive,
  FolderOpen,
  Trash2,
  Play,
  Clock,
  Calendar,
  Search,
  Download,
  Copy,
  HardDrive,
  RefreshCw,
  Check,
  Monitor,
  Video,
  VideoOff,
  Mic,
  Layers,
} from 'lucide-vue-next';
import StudioReviewModal from '../studio/StudioReviewModal.vue';
import ExportDestinationModal from '../studio/ExportDestinationModal.vue';
import { deleteSession, openExportDirectory } from '../../lib/tauriBridge';
import type { RecordingSession } from '../../types/studio';

const props = defineProps<{
  sessionsList: RecordingSession[];
  isLoadingSessions: boolean;
  projectsBaseDir: string;
}>();

const emit = defineEmits<{
  (e: 'refresh'): void;
}>();

const sessionSearchQuery = shallowRef('');
const copiedSessionId = shallowRef<string | null>(null);
const sessionActionNotice = shallowRef<string | null>(null);

const reviewModalSession = shallowRef<RecordingSession | null>(null);
const isReviewModalOpen = shallowRef(false);

const exportModalSession = shallowRef<RecordingSession | null>(null);
const isExportModalOpen = shallowRef(false);

const filteredSessions = computed(() => {
  const q = sessionSearchQuery.value.trim().toLowerCase();
  if (!q) return props.sessionsList;
  return props.sessionsList.filter((s) => {
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
  const res = await openExportDirectory(props.projectsBaseDir);
  if (!res.success) {
    navigator.clipboard?.writeText(props.projectsBaseDir).catch(() => {});
    sessionActionNotice.value = `Projects path copied: ${props.projectsBaseDir}`;
    setTimeout(() => { sessionActionNotice.value = null; }, 3500);
  }
}

async function handleOpenSpecificSessionFolder(session: RecordingSession) {
  const targetPath = session.sessionDir || (session.screenPath ? session.screenPath.replace(/\/[^/]+$/, '') : `${props.projectsBaseDir}/${session.id}`);
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
    emit('refresh');
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
</script>

<template>
  <main class="flex-1 overflow-y-auto p-6 md:p-8 z-20">
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
              <span class="text-white select-all">{{ props.projectsBaseDir }}</span>
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
              <span v-if="filteredSessions.length !== props.sessionsList.length"> (of {{ props.sessionsList.length }})</span>
            </span>
            <button
              @click="emit('refresh')"
              :disabled="props.isLoadingSessions"
              class="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-gray-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw :class="['w-3.5 h-3.5', props.isLoadingSessions ? 'animate-spin text-cyan-400' : '']" />
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
      <div v-if="filteredSessions.length === 0 && !props.isLoadingSessions" class="p-12 text-center rounded-3xl bg-white/[0.02] border border-white/5 space-y-3">
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

    <!-- Review Modal inside SessionsSection -->
    <StudioReviewModal
      v-if="isReviewModalOpen"
      :initial-session-id="reviewModalSession?.id"
      @close="isReviewModalOpen = false; emit('refresh');"
    />

    <!-- Export Modal inside SessionsSection -->
    <ExportDestinationModal
      :is-open="isExportModalOpen"
      :session-id="exportModalSession?.id"
      :session-metadata="exportModalSession || undefined"
      @close="isExportModalOpen = false; emit('refresh');"
    />
  </main>
</template>
