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
import type { CameraShape, CameraSize, BgRemovalMode } from '@/types/studio';

const props = defineProps<{
  hasCameraStream: boolean;
  isMirrored: boolean;
  bgMode: BgRemovalMode;
  isBgPillVisible?: boolean;
  bgPillLabel?: string;
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
  (e: 'setShape'): void;
  (e: 'setSize', size: CameraSize): void;
  (e: 'toggleMirror'): void;
  (e: 'toggleBgMode'): void;
  (e: 'uploadBgImage'): void;
  (e: 'hide'): void;
  (e: 'dragMouseDown', event: MouseEvent): void;
  (e: 'startResize', event: MouseEvent): void;
  (e: 'wheelResize', event: WheelEvent): void;
}>();
</script>

<template>
  <div class="relative flex flex-col items-center">
    <div
      @mousedown="emit('dragMouseDown', $event)"
      @wheel.prevent="emit('wheelResize', $event)"
      class="relative overflow-hidden transition-all duration-300 bg-slate-900 border border-slate-200/20 dark:border-slate-700/50 shadow-2xl cursor-grab active:cursor-grabbing"
      :class="props.shapeClass"
      :style="props.haloStyle"
    >
      <slot name="video" />

      <div
        v-if="!props.hasCameraStream"
        class="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-white pointer-events-none"
        :class="props.bgMode === 'off' ? 'bg-slate-900' : 'bg-transparent'"
      >
        <div class="relative w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
          <User class="w-8 h-8 text-blue-400" />
          <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border border-slate-900" />
        </div>
        <span class="text-xs font-medium text-slate-200 mt-2">Speaker View</span>
        <span class="text-[10px] text-slate-400">{{ props.isRecording ? 'Live Track' : 'Ready' }}</span>
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
          class="absolute -top-7 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-white/95 dark:bg-slate-900/95 border border-slate-400/50 text-[10px] font-mono font-bold text-slate-800 dark:text-slate-200 shadow-2xl pointer-events-none whitespace-nowrap"
        >
          {{ props.customDiameter }}px
        </div>

        <div class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/95 dark:bg-slate-900/95 shadow-xl border border-slate-200 dark:border-slate-700 whitespace-nowrap">
          <button
            @click="emit('setShape')"
            class="w-6 h-6 rounded-full text-slate-700 dark:text-slate-200 flex items-center justify-center"
          >
            <Square v-if="props.shape === 'squircle'" class="w-3.5 h-3.5" />
            <RectangleHorizontal v-else-if="props.shape === 'rect16_9'" class="w-3.5 h-3.5" />
            <Circle v-else class="w-3.5 h-3.5" />
          </button>

          <div class="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5"></div>

          <button
            @click="emit('setSize', 'S')"
            :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'S' && !props.customDiameter ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400']"
          >
            S
          </button>
          <button
            @click="emit('setSize', 'M')"
            :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'M' && !props.customDiameter ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400']"
          >
            M
          </button>
          <button
            @click="emit('setSize', 'L')"
            :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'L' && !props.customDiameter ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400']"
          >
            L
          </button>

          <button
            data-resize-handle="true"
            @mousedown.stop="emit('startResize', $event)"
            :class="[
              'w-6 h-6 rounded-full flex items-center justify-center transition cursor-ew-resize',
              props.customDiameter || props.isResizing ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            ]"
          >
            <Scaling class="w-3.5 h-3.5" />
          </button>

          <div class="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5"></div>

          <button
            @click="emit('toggleMirror')"
            class="w-6 h-6 rounded-full text-slate-600 dark:text-slate-300 flex items-center justify-center"
            title="Mirror"
          >
            <FlipHorizontal class="w-3.5 h-3.5" />
          </button>

          <button
            @click="emit('toggleBgMode')"
            :class="['w-6 h-6 rounded-full flex items-center justify-center transition', props.bgMode !== 'off' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400']"
            title="Cycle Background Mode"
          >
            <Sparkles class="w-3.5 h-3.5" />
          </button>

          <button
            @click="emit('uploadBgImage')"
            class="w-6 h-6 rounded-full text-slate-600 dark:text-slate-300 flex items-center justify-center"
            title="Upload Background Image"
          >
            <ImagePlus class="w-3.5 h-3.5" />
          </button>

          <button
            @click="emit('hide')"
            class="w-6 h-6 rounded-full text-slate-400 hover:text-rose-500 flex items-center justify-center"
            title="Hide Camera"
          >
            <EyeOff class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
