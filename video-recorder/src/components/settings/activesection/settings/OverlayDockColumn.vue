<script setup lang="ts">
import {
  Palette,
  Minimize2,
  Maximize2,
  Link2,
  Eye,
  EyeOff,
  Timer,
  Shield,
  Layers,
} from 'lucide-vue-next';
import { useStudioState } from '@/composables/useStudioState';

const {
  isCameraHidden,
  isDockedToCamera,
  isToolbarCollapsed,
  countdownDuration,
  chunkDuration,
  autoHideCameraOnRecord,
} = useStudioState();
</script>

<template>
  <div class="p-5 rounded-3xl bg-[#0e111a]/90 border border-white/10 shadow-xl space-y-4">
    <div class="flex items-center gap-2.5">
      <div
        class="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
        <Palette class="w-4 h-4" />
      </div>
      <div>
        <h3 class="text-sm font-bold text-white">4. Overlays & Recording Chunks</h3>
        <p class="text-[11px] text-white/50">Countdown, chunk intervals & capture isolation</p>
      </div>
    </div>

    <!-- Pre-Roll Countdown Slider (0 - 10 seconds) -->
    <div class="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
      <div class="flex items-center justify-between text-xs text-white">
        <span class="flex items-center gap-2 font-semibold">
          <Timer class="w-4 h-4 text-rose-400" />
          <span>Pre-Roll Countdown</span>
        </span>
        <span class="px-2 py-0.5 rounded bg-white/10 text-[10px] font-mono text-rose-300 font-semibold">
          {{ countdownDuration === 0 ? 'IMMEDIATE (0s)' : `${countdownDuration}s COUNTDOWN` }}
        </span>
      </div>
      <div class="flex items-center gap-3 pt-1">
        <span class="text-[10px] font-mono text-white/40">0s</span>
        <input
          type="range"
          min="0"
          max="10"
          step="1"
          v-model.number="countdownDuration"
          class="w-full accent-rose-500 cursor-pointer h-1.5 bg-white/15 rounded-lg appearance-none"
        />
        <span class="text-[10px] font-mono text-white/40">10s</span>
      </div>
      <p class="text-[10px] text-white/40 leading-relaxed">
        {{ countdownDuration === 0 ? 'Recording starts instantly without waiting.' : `Shows a ${countdownDuration}-second visual leader with an instant "Start Now" skip button.` }}
      </p>
    </div>

    <!-- Recording Segment Chunk Size Slider (5 - 60 seconds) -->
    <div class="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
      <div class="flex items-center justify-between text-xs text-white">
        <span class="flex items-center gap-2 font-semibold">
          <Layers class="w-4 h-4 text-indigo-400" />
          <span>Recording Chunk Size</span>
        </span>
        <span class="px-2 py-0.5 rounded bg-white/10 text-[10px] font-mono text-indigo-300 font-semibold">
          {{ chunkDuration }}s CHUNKS
        </span>
      </div>
      <div class="flex items-center gap-3 pt-1">
        <span class="text-[10px] font-mono text-white/40">5s</span>
        <input
          type="range"
          min="5"
          max="60"
          step="5"
          v-model.number="chunkDuration"
          class="w-full accent-indigo-500 cursor-pointer h-1.5 bg-white/15 rounded-lg appearance-none"
        />
        <span class="text-[10px] font-mono text-white/40">60s</span>
      </div>
      <p class="text-[10px] text-white/40 leading-relaxed">
        <span v-if="chunkDuration < 15" class="text-emerald-400/90 font-medium">
          High Crash Safety: Max ~{{ chunkDuration }}s lost if system abruptly powers off, but produces more segments to join.
        </span>
        <span v-else-if="chunkDuration === 15" class="text-indigo-300/90 font-medium">
          Balanced (Recommended): Optimal balance between crash recovery and fast file finalization.
        </span>
        <span v-else class="text-amber-300/90 font-medium">
          Low Disk Overhead: Fewer chunk files on disk and faster finalization, ideal for long lectures or webinars.
        </span>
      </p>
    </div>

    <!-- Quick Overlay Window Actions -->
    <div class="grid grid-cols-1 gap-2.5">
      <!-- Auto-hide camera on record (Linux Clean Screen Recording) -->
      <button
        @click="autoHideCameraOnRecord = !autoHideCameraOnRecord"
        class="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-xs text-white transition"
      >
        <span class="flex items-center gap-2 font-semibold">
          <Shield class="w-4 h-4 text-emerald-400" />
          <span>Hide Bubble during Screen Record</span>
        </span>
        <span
          class="px-2 py-0.5 rounded text-[10px] font-mono"
          :class="autoHideCameraOnRecord ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/10 text-white/50'"
        >
          {{ autoHideCameraOnRecord ? 'ENABLED' : 'DISABLED' }}
        </span>
      </button>

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
</template>
