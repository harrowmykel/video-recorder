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
  <div class="relative w-full h-full overflow-hidden" :class="props.shapeClass">
    <slot name="video" />

    <div
      v-if="!props.hasCameraStream"
      class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#131b2e] via-[#0d1222] to-[#070913] text-white relative"
    >
      <div class="relative w-16 h-16 rounded-full bg-sky-400/20 border border-sky-300/40 flex items-center justify-center shadow-lg">
        <User class="w-8 h-8 text-sky-200" />
        <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900" />
      </div>
      <span class="text-xs font-semibold text-white/90 mt-2">Spatial Pod</span>
      <span class="text-[10px] font-mono text-sky-300">{{ props.isRecording ? 'Capturing' : 'Vision Ready' }}</span>
    </div>

    <!-- Top Safe AI Pill -->
    <div
      v-if="props.bgMode !== 'off'"
      class="absolute top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full spatial-glass-dark text-[10px] font-semibold text-sky-300 flex items-center gap-1 z-10"
    >
      <Sparkles class="w-3 h-3" />
      <span>Studio Blur</span>
    </div>

    <!-- Safe-Zone Floating Spatial Dock -->
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
        class="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2.5 py-1.5 rounded-full spatial-glass-dark shadow-2xl"
      >
        <button
          @click="emit('setShape', props.shape === 'circle' ? 'squircle' : 'circle')"
          class="w-6 h-6 rounded-full spatial-pill-btn flex items-center justify-center text-white/80 hover:text-white"
        >
          <component :is="props.shape === 'circle' ? Circle : Square" class="w-3 h-3" />
        </button>

        <div class="w-px h-3.5 bg-white/20 mx-0.5"></div>

        <button
          @click="emit('setSize', 'S')"
          :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'S' ? 'bg-sky-400 text-slate-950 shadow' : 'spatial-pill-btn text-white/70']"
        >
          S
        </button>
        <button
          @click="emit('setSize', 'M')"
          :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'M' ? 'bg-sky-400 text-slate-950 shadow' : 'spatial-pill-btn text-white/70']"
        >
          M
        </button>
        <button
          @click="emit('setSize', 'L')"
          :class="['w-6 h-6 rounded-full text-[10px] font-bold transition', props.size === 'L' ? 'bg-sky-400 text-slate-950 shadow' : 'spatial-pill-btn text-white/70']"
        >
          L
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
          title="AI Studio Mode"
        >
          <Sparkles class="w-3 h-3" />
        </button>
      </div>
    </transition>
  </div>
</template>
