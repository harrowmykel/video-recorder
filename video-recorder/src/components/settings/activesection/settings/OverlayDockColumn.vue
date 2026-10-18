<script setup lang="ts">
import {
  Palette,
  Minimize2,
  Maximize2,
  Link2,
  Eye,
  EyeOff,
} from 'lucide-vue-next';
import { useStudioState } from '../../../../composables/useStudioState';

const {
  isCameraHidden,
  isDockedToCamera,
  isToolbarCollapsed,
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
</template>
