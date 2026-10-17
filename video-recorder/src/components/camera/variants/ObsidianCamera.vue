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
    <!-- Slot for the shared <video> element rendered by parent controller -->
    <slot name="video" />

    <!-- Fallback Avatar if no camera stream -->
    <div
      v-if="!props.hasCameraStream"
      class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#161922] via-[#0e1017] to-[#07080b] text-white relative"
    >
      <div class="relative w-16 h-16 rounded-full bg-rose-500/20 border border-rose-400/30 flex items-center justify-center shadow-lg">
        <User class="w-8 h-8 text-rose-200" />
        <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-black" />
      </div>
      <span class="text-xs font-semibold text-white/90 mt-2">FaceCam</span>
      <span class="text-[10px] font-mono text-white/50">{{ props.isRecording ? 'RAW ISO' : 'Standby' }}</span>
    </div>

    <!-- Active AI Matting Badge -->
    <div
      v-if="props.bgMode !== 'off'"
      class="absolute top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-black/80 border border-white/15 text-[10px] font-medium text-rose-300 flex items-center gap-1 backdrop-blur-md z-10"
    >
      <Sparkles class="w-3 h-3" />
      <span>AI Cutout</span>
    </div>

    <!-- Safe-Zone Bottom Floating Dock (Never Clipped by Circular Bezel) -->
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
        class="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1 rounded-xl obsidian-panel shadow-2xl"
      >
        <!-- Shape -->
        <button
          @click="emit('setShape', props.shape === 'circle' ? 'squircle' : 'circle')"
          class="w-6 h-6 rounded-lg obsidian-btn flex items-center justify-center text-white/80 hover:text-white"
          title="Toggle Shape"
        >
          <component :is="props.shape === 'circle' ? Circle : Square" class="w-3.5 h-3.5" />
        </button>

        <div class="w-px h-3.5 bg-white/15 mx-0.5"></div>

        <!-- Sizes -->
        <button
          @click="emit('setSize', 'S')"
          :class="['w-6 h-6 rounded-lg text-[10px] font-bold transition', props.size === 'S' ? 'bg-rose-500 text-white' : 'obsidian-btn text-white/70']"
        >
          S
        </button>
        <button
          @click="emit('setSize', 'M')"
          :class="['w-6 h-6 rounded-lg text-[10px] font-bold transition', props.size === 'M' ? 'bg-rose-500 text-white' : 'obsidian-btn text-white/70']"
        >
          M
        </button>
        <button
          @click="emit('setSize', 'L')"
          :class="['w-6 h-6 rounded-lg text-[10px] font-bold transition', props.size === 'L' ? 'bg-rose-500 text-white' : 'obsidian-btn text-white/70']"
        >
          L
        </button>

        <div class="w-px h-3.5 bg-white/15 mx-0.5"></div>

        <!-- Mirror -->
        <button
          @click="emit('toggleMirror')"
          class="w-6 h-6 rounded-lg obsidian-btn flex items-center justify-center text-white/80 hover:text-white"
          title="Mirror Camera"
        >
          <FlipHorizontal class="w-3.5 h-3.5" />
        </button>

        <!-- AI Cutout -->
        <button
          @click="emit('toggleBgMode')"
          :class="['w-6 h-6 rounded-lg flex items-center justify-center transition', props.bgMode !== 'off' ? 'bg-rose-500/30 text-rose-300 border border-rose-400/40' : 'obsidian-btn text-white/80']"
          title="AI Background Removal"
        >
          <Sparkles class="w-3.5 h-3.5" />
        </button>
      </div>
    </transition>
  </div>
</template>
