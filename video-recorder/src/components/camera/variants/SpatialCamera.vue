<script setup lang="ts">
import {
  Sparkles,
  FlipHorizontal,
  Circle,
  Square,
  RectangleHorizontal,
  User,
  Scaling,
  ImagePlus,
  EyeOff
} from 'lucide-vue-next';
import type { CameraShape, CameraSize, BgRemovalMode } from '../../../types/studio';

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
  (e: 'uploadBgImage'): void;
  (e: 'hide'): void;
  (e: 'dragMouseDown', event: MouseEvent): void;
  (e: 'startResize', event: MouseEvent): void;
  (e: 'wheelResize', event: WheelEvent): void;
}>();

function nextShape(): CameraShape {
  if (props.shape === 'circle') return 'squircle';
  if (props.shape === 'squircle') return 'rect16_9';
  return 'circle';
}
</script>

<template>
  <div class="relative flex flex-col items-center">
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
        class="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-white pointer-events-none"
        :class="props.bgMode === 'off' ? 'bg-gradient-to-b from-[#131b2e] via-[#0d1222] to-[#070913]' : 'bg-transparent'"
      >
        <div class="relative w-16 h-16 rounded-full bg-sky-400/20 border border-sky-300/40 flex items-center justify-center shadow-lg backdrop-blur-sm">
          <User class="w-8 h-8 text-sky-200" />
          <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900" />
        </div>
        <span class="text-xs font-semibold text-white/90 mt-2 drop-shadow">Spatial Pod</span>
        <span class="text-[10px] font-mono text-sky-300 drop-shadow">{{ props.isRecording ? 'Capturing' : 'Vision Ready' }}</span>
      </div>

      <div
        v-if="props.bgMode !== 'off'"
        class="absolute top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full spatial-glass-dark text-[10px] font-semibold text-sky-300 flex items-center gap-1 z-10 pointer-events-none"
      >
        <Sparkles class="w-3 h-3" />
        <span class="uppercase">{{ props.bgMode === 'image' ? 'Custom BG' : props.bgMode }}</span>
      </div>
    </div>

    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-1 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-1 scale-95"
    >
      <div
        v-if="props.isHovered"
        class="absolute top-full pt-2.5 left-1/2 -translate-x-1/2 z-30 pointer-events-auto"
      >
        <div
          v-if="props.isResizing"
          class="absolute -top-7 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full spatial-glass-dark border border-sky-400/50 text-[10px] font-mono font-bold text-sky-300 shadow-2xl pointer-events-none whitespace-nowrap"
        >
          {{ props.customDiameter }}px
        </div>

        <div class="flex items-center gap-1 px-2.5 py-1.5 rounded-full spatial-glass-dark shadow-2xl whitespace-nowrap">
          <button
            @click="emit('setShape', nextShape())"
            class="w-6 h-6 rounded-full spatial-pill-btn flex items-center justify-center text-white/80 hover:text-white"
            title="Cycle Shape"
          >
            <Circle v-if="props.shape === 'circle'" class="w-3 h-3" />
            <Square v-else-if="props.shape === 'squircle'" class="w-3 h-3" />
            <RectangleHorizontal v-else class="w-3 h-3" />
          </button>

          <div class="w-px h-3.5 bg-white/20 mx-0.5"></div>

          <button
            @click="emit('setSize', 'S')"
            :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'S' && !props.customDiameter ? 'bg-sky-400 text-slate-950 shadow' : 'spatial-pill-btn text-white/70']"
          >
            S
          </button>
          <button
            @click="emit('setSize', 'M')"
            :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'M' && !props.customDiameter ? 'bg-sky-400 text-slate-950 shadow' : 'spatial-pill-btn text-white/70']"
          >
            M
          </button>
          <button
            @click="emit('setSize', 'L')"
            :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'L' && !props.customDiameter ? 'bg-sky-400 text-slate-950 shadow' : 'spatial-pill-btn text-white/70']"
          >
            L
          </button>

          <button
            data-resize-handle="true"
            @mousedown.stop="emit('startResize', $event)"
            :class="[
              'w-6 h-6 rounded-full flex items-center justify-center transition cursor-ew-resize',
              props.customDiameter || props.isResizing ? 'bg-sky-400/30 text-sky-200 border border-sky-300/40' : 'spatial-pill-btn text-white/70 hover:text-white'
            ]"
          >
            <Scaling class="w-3 h-3" />
          </button>

          <div class="w-px h-3.5 bg-white/20 mx-0.5"></div>

          <button
            @click="emit('toggleMirror')"
            class="w-6 h-6 rounded-full spatial-pill-btn flex items-center justify-center text-white/80 hover:text-white"
            title="Mirror"
          >
            <FlipHorizontal class="w-3 h-3" />
          </button>

          <button
            @click="emit('toggleBgMode')"
            :class="['w-6 h-6 rounded-full flex items-center justify-center transition', props.bgMode !== 'off' ? 'bg-amber-400/30 text-amber-200 border border-amber-300/40' : 'spatial-pill-btn text-white/80']"
            title="Cycle Background Mode"
          >
            <Sparkles class="w-3 h-3" />
          </button>

          <button
            @click="emit('uploadBgImage')"
            class="w-6 h-6 rounded-full spatial-pill-btn flex items-center justify-center text-white/80 hover:text-white"
            title="Upload Background Image"
          >
            <ImagePlus class="w-3 h-3" />
          </button>

          <button
            @click="emit('hide')"
            class="w-6 h-6 rounded-full spatial-pill-btn flex items-center justify-center text-white/60 hover:text-rose-400"
            title="Hide Camera"
          >
            <EyeOff class="w-3 h-3" />
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
