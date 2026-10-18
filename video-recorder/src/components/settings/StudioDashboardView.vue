<script setup lang="ts">
import { ref, shallowRef, onMounted } from 'vue';
import {
  Wifi,
  BatteryCharging,
  Layers,
  FolderArchive,
  Sliders,
  Sparkles,
  Film,
} from 'lucide-vue-next';
import WorkspaceSection from '@/components/settings/activesection/WorkspaceSection.vue';
import SettingsSection from '@/components/settings/activesection/SettingsSection.vue';
import BackgroundsSection from '@/components/settings/activesection/BackgroundsSection.vue';
import AiStudioSection from '@/components/settings/activesection/AiStudioSection.vue';
import SessionsSection from '@/components/settings/activesection/SessionsSection.vue';
import { useStudioState } from '@/composables/useStudioState';
import {
  fetchRecordedSessions,
  getDefaultVideosDirectory,
  isNativeOverlayWindow,
  STUDIO_PROJECTS_DIR,
} from '@/lib/tauriBridge';
import type { RecordingSession } from '@/types/studio';

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

const { recordingState, captureSourceMode } = useStudioState();

const isNativeWindow = isNativeOverlayWindow();
const activeSection = shallowRef<'workspace' | 'settings' | 'backgrounds' | 'ai_studio' | 'sessions'>(
  props.initialSection || (isNativeWindow ? 'settings' : 'workspace')
);

const sessionsList = ref<RecordingSession[]>([]);
const isLoadingSessions = shallowRef(false);
const projectsBaseDir = shallowRef(STUDIO_PROJECTS_DIR);

async function loadSessions() {
  isLoadingSessions.value = true;
  try {
    sessionsList.value = await fetchRecordedSessions();
  } finally {
    isLoadingSessions.value = false;
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

          <button @click="activeSection = 'settings'" :class="[
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
    <WorkspaceSection v-if="activeSection === 'workspace'" :audio-volume="props.audioVolume"
      @navigate="(s) => activeSection = s" @toggle-camera="emit('toggleCamera')" @toggle-dock="emit('toggleDock')"
      @toggle-annotation="emit('toggleAnnotation')" @toggle-live-zoom="emit('toggleLiveZoom')"
      @open-area-picker="emit('openAreaPicker')" />

    <!-- SECTION 2: Settings & Devices Control Center -->
    <SettingsSection v-else-if="activeSection === 'settings'" :audio-volume="props.audioVolume"
      @open-area-picker="emit('openAreaPicker')" @open-backgrounds="activeSection = 'backgrounds'"
      @navigate="(s) => activeSection = s" />

    <!-- SECTION 3: Real-Time Camera Background Studio -->
    <BackgroundsSection v-else-if="activeSection === 'backgrounds'" :audio-volume="props.audioVolume" />

    <!-- SECTION 4: AI Batch Background Remover Studio -->
    <AiStudioSection v-else-if="activeSection === 'ai_studio'" />

    <!-- SECTION 5: Undeleted Project Sessions Browser -->
    <SessionsSection v-else-if="activeSection === 'sessions'" :sessions-list="sessionsList"
      :is-loading-sessions="isLoadingSessions" :projects-base-dir="projectsBaseDir" @refresh="loadSessions" />
  </div>
</template>
