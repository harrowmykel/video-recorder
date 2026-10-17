<script setup lang="ts">
import {
  User,
  Scaling
} from 'lucide-vue-next';
import { CameraShape, CameraSize, BgRemovalMode } from '../../../types/studio';

const props = defineProps<{
  hasCameraStream: boolean;
  isMirrored: boolean;
  bgMode: BgRemovalMode;
  shape: CameraShape;
  size: CameraSize;
  customDiameter?: number | null;
  isResizing?: boolean;
  isRecording: boolean;
  isHovered: boolean;
  shapeClass: string;
  haloStyle?: Record<string, any>;
}>();

const emit = defineEmits<{
  (e: 'setShape', shape: CameraShape): void;
  (e: 'setSize', size: CameraSize): void;
  (e: 'toggleMirror'): void;
  (e: 'toggleBgMode'): void;
  (e: 'hide'): void;
  (e: 'dragMouseDown', event: MouseEvent): void;
  (e: 'startResize', event: MouseEvent): void;
  (e: 'wheelResize', event: WheelEvent): void;
}>();
</script>

<template>
  <div class="relative flex flex-col items-center font-mono">
    <!-- Camera Frame (Circle / Squircle / Rect) with Speaking Glow Halo -->
    <div
      @mousedown="emit('dragMouseDown', $event)"
      @wheel.prevent="emit('wheelResize', $event)"
      class="relative overflow-hidden transition-all duration-300 bg-studio-surface cursor-grab active:cursor-grabbing"
      :class="props.shapeClass"
      :style="props.haloStyle"
    >
      <slot name="video" />

      <div
        v-if="!props.hasCameraStream"
        class="w-full h-full flex flex-col items-center justify-center bg-[#0e1014] text-zinc-300 relative"
      >
        <div class="relative w-16 h-16 rounded-full bg-[#1b1e25] border-2 border-[#ff5500] flex items-center justify-center shadow-lg">
          <User class="w-8 h-8 text-[#ff5500]" />
          <span class="absolute bottom-0 right-0 w-3 h-3 bg-[#00e676]" />
        </div>
        <span class="text-xs font-bold text-white mt-2">CAM_A // MONITOR</span>
        <span class="text-[9px] text-[#00e676]">1080P60 RAW</span>
      </div>

      <!-- Top Telemetry Pill -->
      <div class="absolute top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black/90 border border-zinc-700 text-[9px] text-[#00e676] z-10 uppercase tracking-wider">
        CAM_01 • {{ props.isRecording ? 'REC_LOCK' : 'STBY' }}
      </div>

      <!-- Live Dynamic Size Readout during resize -->
      <div
        v-if="props.isResizing"
        class="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center pointer-events-none"
      >
        <span class="px-2 py-0.5 rounded bg-[#0b0c0e] border border-[#ff5500] text-[10px] font-mono font-bold text-[#ff5500] uppercase tracking-wider shadow-2xl">
          SCALE // {{ props.customDiameter }}PX
        </span>
      </div>

      <!-- Interactive Corner Drag Resize Handle -->
      <transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 scale-75"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-75"
      >
        <div
          v-if="props.isHovered"
          data-resize-handle="true"
          @mousedown.stop="emit('startResize', $event)"
          class="absolute bottom-2 right-2 px-1.5 py-1 rounded bg-[#0b0c0e]/95 border border-zinc-700 hover:border-[#ff5500] text-zinc-300 hover:text-[#ff5500] flex items-center gap-1 cursor-nwse-resize shadow-lg z-20 transition-all active:scale-95 group/handle"
          title="Drag or Scroll to Resize"
        >
          <Scaling class="w-3 h-3" />
          <span class="text-[8px] font-bold tracking-tighter">RSZ</span>
        </div>
      </transition>
    </div>

    <!-- Bottom Technical Control Strip (Beneath Circle, Never Clipped) -->
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="props.isHovered"
        class="absolute top-full pt-2.5 left-1/2 -translate-x-1/2 z-30 pointer-events-auto"
      >
        <div class="flex items-center gap-1 px-2 py-1 rounded bg-[#0b0c0e]/95 border border-zinc-700 shadow-2xl whitespace-nowrap">
          <button
            @click="emit('setShape', props.shape === 'circle' ? 'squircle' : 'circle')"
            class="px-1.5 py-0.5 rounded-sm tactile-key text-[10px] text-zinc-300"
          >
            {{ props.shape === 'circle' ? '1:1' : 'SQ' }}
          </button>

          <div class="w-px h-3 bg-zinc-700 mx-0.5"></div>

          <button
            @click="emit('setSize', 'S')"
            :class="['px-1.5 py-0.5 rounded-sm text-[10px] font-bold transition', props.size === 'S' && !props.customDiameter ? 'bg-[#ff5500] text-black' : 'tactile-key text-zinc-300']"
            title="S Preset (160px)"
          >
            S
          </button>
          <button
            @click="emit('setSize', 'M')"
            :class="['px-1.5 py-0.5 rounded-sm text-[10px] font-bold transition', props.size === 'M' && !props.customDiameter ? 'bg-[#ff5500] text-black' : 'tactile-key text-zinc-300']"
            title="M Preset (240px)"
          >
            M
          </button>
          <button
            @click="emit('setSize', 'L')"
            :class="['px-1.5 py-0.5 rounded-sm text-[10px] font-bold transition', props.size === 'L' && !props.customDiameter ? 'bg-[#ff5500] text-black' : 'tactile-key text-zinc-300']"
            title="L Preset (340px)"
          >
            L
          </button>

          <div class="w-px h-3 bg-zinc-700 mx-0.5"></div>

          <button
            @click="emit('toggleMirror')"
            class="px-1.5 py-0.5 rounded-sm tactile-key text-[10px] text-zinc-300"
            title="FLIP"
          >
            FLIP
          </button>

          <button
            @click="emit('toggleBgMode')"
            :class="['px-1.5 py-0.5 rounded-sm text-[10px] font-bold', props.bgMode !== 'off' ? 'bg-[#00e676] text-black' : 'tactile-key text-zinc-400']"
            title="AI Alpha Matte"
          >
            KEY
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
