<script setup lang="ts">
import { ref, shallowRef, onMounted, useTemplateRef } from 'vue';
import {
  Monitor,
  AppWindow,
  Crop,
  Video,
  VideoOff,
  Mic,
  Palette,
  Check,
  RefreshCw,
  Minimize2,
  Maximize2,
  Link2,
  Eye,
  EyeOff,
  Sparkles,
  Upload,
} from 'lucide-vue-next';
import { useStudioState } from '../../composables/useStudioState';
import { useMediaDevices } from '../../composables/useMediaDevices';
import { useTheme } from '../../composables/useTheme';
import { THEME_LIST, StudioTheme } from '../../themes';
import { fetchCaptureSources } from '../../lib/tauriBridge';
import type { DisplaySourceInfo, WindowSourceInfo } from '../../types/studio';

const props = defineProps<{
  audioVolume: number;
}>();

const emit = defineEmits<{
  (e: 'openAreaPicker'): void;
}>();

const {
  isCameraHidden,
  isDockedToCamera,
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
  bgMode,
  bgImageUrl,
  bgPresets,
  setCustomBgImageFromFile,
} = useStudioState();

const { cameras, microphones, liveMicLevel, refreshDevices, startMicMeter } = useMediaDevices();
const { currentTheme, setTheme } = useTheme();

const displays = ref<DisplaySourceInfo[]>([]);
const windows = ref<WindowSourceInfo[]>([]);
const isLoadingSources = shallowRef(false);
const bgUploadInput = useTemplateRef<HTMLInputElement>('bgUploadInput');

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

function handleSelectTheme(themeId: StudioTheme) {
  setTheme(themeId);
}

onMounted(() => {
  refreshDevices(false);
  loadSources();
});
</script>

<template>
  <main class="flex-1 overflow-y-auto p-6 md:p-8 z-20">
    <div class="max-w-6xl mx-auto space-y-6">
      <!-- 3 Columns Device & Capture Layout -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Column 1: Screen Capture Source (Display, Window, Area) -->
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
            <span class="text-[10px] font-mono uppercase text-white/40 block">Open Desktop Windows ({{ windows.length }})</span>
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

        <!-- Column 2: Camera Device & Real-Time Background Settings -->
        <div class="p-5 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-xl space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Video class="w-4 h-4" />
              </div>
              <div>
                <h3 class="text-sm font-bold text-white">2. Camera & Background</h3>
                <p class="text-[11px] text-white/50">Camera hardware & virtual backdrop</p>
              </div>
            </div>
            <button @click="refreshDevices(true)"
              class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
              title="Rescan Hardware Cameras">
              <RefreshCw class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Camera Device List -->
          <div class="space-y-1.5">
            <label class="text-[10px] font-mono uppercase text-white/50 block">Active Camera Device</label>
            <div class="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
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

          <!-- Real-Time Background Setting (beneath camera devices like in popup) -->
          <div class="pt-3 border-t border-white/10">
            <div v-if="selectedCameraId !== 'none'" class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-mono uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                  <Sparkles class="w-3.5 h-3.5 text-rose-400" />
                  <span>Real-Time Background Mode</span>
                </span>
                <button
                  @click="bgUploadInput?.click()"
                  class="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-300 text-[11px] font-semibold flex items-center gap-1 transition shadow-sm"
                >
                  <Upload class="w-3 h-3" />
                  <span>Upload BG</span>
                </button>
                <input
                  ref="bgUploadInput"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="handleBgImageFileChange"
                />
              </div>

              <!-- Background Mode Switcher (off, blur, cutout, image, gradient) -->
              <div class="grid grid-cols-5 gap-1.5">
                <button
                  v-for="mode in (['off', 'blur', 'transparent', 'image', 'gradient'] as const)"
                  :key="mode"
                  @click="bgMode = mode"
                  :class="[
                    'py-1.5 px-1.5 rounded-xl text-[11px] font-semibold capitalize border transition text-center',
                    bgMode === mode
                      ? 'bg-rose-500 text-white border-rose-400 shadow'
                      : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
                  ]"
                >
                  {{ mode === 'transparent' ? 'Cutout' : mode }}
                </button>
              </div>

              <!-- Preset Studio Background Images Strip -->
              <div class="space-y-1">
                <span class="text-[10px] font-mono uppercase text-white/40 block">Studio Presets</span>
                <div class="grid grid-cols-4 gap-2">
                  <button
                    v-for="preset in bgPresets"
                    :key="preset.id"
                    @click="bgMode = preset.type; if (preset.type === 'image') bgImageUrl = preset.value;"
                    class="h-12 rounded-xl border border-white/15 hover:border-white/50 overflow-hidden relative group transition"
                    :style="{ background: preset.thumbnail }"
                    :title="preset.name"
                  >
                    <span class="absolute inset-x-0 bottom-0 bg-black/75 text-[9px] text-white font-medium py-0.5 truncate px-1">
                      {{ preset.name }}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Placeholder when Camera is Disabled -->
            <div v-else class="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 text-center space-y-1.5">
              <div class="flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-300">
                <VideoOff class="w-3.5 h-3.5" />
                <span>Camera Recording Disabled</span>
              </div>
              <p class="text-[11px] text-white/50">
                Select a camera device above to enable camera PiP, virtual backgrounds, and cutout modes.
              </p>
            </div>
          </div>
        </div>

        <!-- Column 3: Audio & Microphone Devices (Dedicated Separate Column) -->
        <div class="p-5 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-xl space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Mic class="w-4 h-4" />
              </div>
              <div>
                <h3 class="text-sm font-bold text-white">3. Audio Input Devices</h3>
                <p class="text-[11px] text-white/50">Microphones & system audio monitor</p>
              </div>
            </div>
            <button @click="refreshDevices(true)"
              class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
              title="Rescan Microphones">
              <RefreshCw class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Microphone Device List -->
          <div class="space-y-1.5">
            <label class="text-[10px] font-mono uppercase text-white/50 block">Microphone Input</label>
            <div class="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
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
      </div>

      <!-- Row 2: Overlays, Controls & Visual Theme -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Overlays & Toolbar Controls (1 Column) -->
        <div class="p-5 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-xl space-y-4">
          <div class="flex items-center gap-2.5">
            <div
              class="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Palette class="w-4 h-4" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-white">4. Overlays & Docking</h3>
              <p class="text-[11px] text-white/50">Toolbar and bubble overlay controls</p>
            </div>
          </div>

          <!-- Quick Overlay Window Actions -->
          <div class="grid grid-cols-1 gap-2.5">
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
        </div>

        <!-- Studio Theme & Appearance (Spans 2 Columns) -->
        <div class="lg:col-span-2 p-5 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-xl space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Monitor class="w-4 h-4" />
              </div>
              <div>
                <h3 class="text-sm font-bold text-white">5. Studio Theme & Appearance</h3>
                <p class="text-[11px] text-white/50">Select your preferred desktop overlay design aesthetic</p>
              </div>
            </div>
          </div>

          <!-- Theme Cards Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div v-for="t in THEME_LIST" :key="t.id" @click="handleSelectTheme(t.id)" :class="[
              'relative p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between group',
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
                <div class="text-[11px] font-medium text-white/50 mb-1">
                  {{ t.tagline }}
                </div>
                <p class="text-xs text-white/60 leading-relaxed mb-3">
                  {{ t.description }}
                </p>
              </div>

              <!-- Color Swatch Strip -->
              <div class="flex items-center gap-1.5 pt-2.5 border-t border-white/5">
                <span v-for="(c, idx) in t.previewColors" :key="idx"
                  class="w-5 h-5 rounded-md shadow-inner border border-white/10" :style="{ backgroundColor: c }"></span>
                <span class="text-[10px] font-mono text-white/40 ml-auto">
                  {{ currentTheme === t.id ? 'ACTIVE' : 'SELECT' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
