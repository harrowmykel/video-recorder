<script setup lang="ts">
import {
  Sparkles,
  FlipHorizontal,
  Circle,
  Square,
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
  <div class="relative w-full h-full overflow-hidden bg-slate-900 border border-slate-200/20 dark:border-slate-700/50 shadow-2xl" :class="props.shapeClass">
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

    <!-- Safe-Zone Floating Pill -->
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-2 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-2 scale-95"
    >
      <div
        v-if="props.isHovered"
        class="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/95 dark:bg-slate-900/95 shadow-xl border border-slate-200 dark:border-slate-700"
      >
        <button
          @click="emit('setShape', props.shape === 'circle' ? 'squircle' : 'circle')"
          class="w-6 h-6 rounded-full text-slate-700 dark:text-slate-200 flex items-center justify-center"
        >
          <component :is="props.shape === 'circle' ? Circle : Square" class="w-3 h-3" />
        </button>

        <div class="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5"></div>

        <button
          @click="emit('setSize', 'S')"
          :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'S' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400']"
        >
          S
        </button>
        <button
          @click="emit('setSize', 'M')"
          :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'M' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400']"
        >
          M
        </button>
        <button
          @click="emit('setSize', 'L')"
          :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'L' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400']"
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
    </transition>
  </div>
</template>
