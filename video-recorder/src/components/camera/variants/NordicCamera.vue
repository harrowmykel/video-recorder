<script setup lang="ts">
import {
  Sparkles,
  FlipHorizontal,
  Circle,
  Square,
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
  <div class="relative flex flex-col items-center">
    <!-- Camera Frame (Circle / Squircle / Rect) with Speaking Glow Halo -->
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
        class="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white relative"
      >
        <div class="relative w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
          <User class="w-8 h-8 text-blue-400" />
          <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border border-slate-900" />
        </div>
        <span class="text-xs font-medium text-slate-200 mt-2">Speaker View</span>
        <span class="text-[10px] text-slate-400">{{ props.isRecording ? 'Live Track' : 'Ready' }}</span>
      </div>

      <!-- Live Dynamic Size Readout during resize -->
      <div
        v-if="props.isResizing"
        class="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center pointer-events-none"
      >
        <span class="px-2.5 py-1 rounded-full bg-white/95 dark:bg-slate-900/95 border border-slate-400/50 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 shadow-2xl">
          {{ props.customDiameter }}px
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
          class="absolute bottom-2.5 right-2.5 w-6 h-6 rounded-full bg-white/90 dark:bg-slate-800/90 hover:bg-blue-500 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:text-white flex items-center justify-center cursor-nwse-resize shadow-lg z-20 backdrop-blur-md transition-all active:scale-95 group/handle"
          title="Drag or Scroll to Resize"
        >
          <Scaling class="w-3.5 h-3.5 group-hover/handle:scale-110 transition-transform duration-200" />
        </div>
      </transition>
    </div>

    <!-- Safe-Zone Floating Pill (Beneath Circle, Never Clipped) -->
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
        <div class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/95 dark:bg-slate-900/95 shadow-xl border border-slate-200 dark:border-slate-700 whitespace-nowrap">
          <button
            @click="emit('setShape', props.shape === 'circle' ? 'squircle' : 'circle')"
            class="w-6 h-6 rounded-full text-slate-700 dark:text-slate-200 flex items-center justify-center"
          >
            <component :is="props.shape === 'circle' ? Circle : Square" class="w-3.5 h-3.5" />
          </button>

          <div class="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5"></div>

          <button
            @click="emit('setSize', 'S')"
            :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'S' && !props.customDiameter ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400']"
            title="Small Preset (160px)"
          >
            S
          </button>
          <button
            @click="emit('setSize', 'M')"
            :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'M' && !props.customDiameter ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400']"
            title="Medium Preset (240px)"
          >
            M
          </button>
          <button
            @click="emit('setSize', 'L')"
            :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'L' && !props.customDiameter ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400']"
            title="Large Preset (340px)"
          >
            L
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
            title="AI Blur"
          >
            <Sparkles class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
