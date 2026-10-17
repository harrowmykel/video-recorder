<script setup lang="ts">
import {
  User
} from 'lucide-vue-next';
import { CameraShape, CameraSize, BgRemovalMode } from '../../../types/studio';

const props = defineProps<{
  hasCameraStream: boolean;
  isMirrored: boolean;
  bgMode: BgRemovalMode;
  shape: CameraShape;
  size: CameraSize;
  isRecording: boolean;
  isHovered: boolean;
  shapeClass: string;
}>();

const emit = defineEmits<{
  (e: 'setShape', shape: CameraShape): void;
  (e: 'setSize', size: CameraSize): void;
  (e: 'toggleMirror'): void;
  (e: 'toggleBgMode'): void;
  (e: 'hide'): void;
}>();
</script>

<template>
  <div class="relative w-full h-full overflow-hidden font-mono" :class="props.shapeClass">
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

    <!-- Bottom Technical Control Strip -->
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="props.isHovered"
        class="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1 rounded bg-[#0b0c0e]/95 border border-zinc-700 shadow-2xl"
      >
        <button
          @click="emit('setShape', props.shape === 'circle' ? 'squircle' : 'circle')"
          class="px-1.5 py-0.5 rounded-sm tactile-key text-[10px] text-zinc-300"
        >
          {{ props.shape === 'circle' ? '1:1' : 'SQ' }}
        </button>

        <div class="w-px h-3 bg-zinc-700 mx-0.5"></div>

        <button
          @click="emit('setSize', 'S')"
          :class="['px-1.5 py-0.5 rounded-sm text-[10px] font-bold', props.size === 'S' ? 'bg-[#ff5500] text-black' : 'tactile-key text-zinc-300']"
        >
          S
        </button>
        <button
          @click="emit('setSize', 'M')"
          :class="['px-1.5 py-0.5 rounded-sm text-[10px] font-bold', props.size === 'M' ? 'bg-[#ff5500] text-black' : 'tactile-key text-zinc-300']"
        >
          M
        </button>
        <button
          @click="emit('setSize', 'L')"
          :class="['px-1.5 py-0.5 rounded-sm text-[10px] font-bold', props.size === 'L' ? 'bg-[#ff5500] text-black' : 'tactile-key text-zinc-300']"
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
    </transition>
  </div>
</template>
