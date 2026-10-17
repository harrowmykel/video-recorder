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
      class="relative overflow-hidden transition-all duration-300 bg-studio-surface cursor-grab active:cursor-grabbing"
      :class="props.shapeClass"
      :style="props.haloStyle"
    >
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
    </div>

    <!-- Floating Dock Beneath the Camera Frame (Outside Circle, Never Clipped) -->
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
        <!-- Floating Live Size HUD during resize above toolbar -->
        <div
          v-if="props.isResizing"
          class="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/95 text-rose-300 text-[10px] font-mono font-bold border border-rose-500/50 shadow-2xl pointer-events-none whitespace-nowrap"
        >
          {{ props.customDiameter }}px
        </div>

        <div class="flex items-center gap-1 px-2 py-1 rounded-xl obsidian-panel shadow-2xl whitespace-nowrap">
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
            :class="['w-6 h-6 rounded-lg text-[10px] font-bold transition', props.size === 'S' && !props.customDiameter ? 'bg-rose-500 text-white' : 'obsidian-btn text-white/70']"
            title="Small Preset (160px)"
          >
            S
          </button>
          <button
            @click="emit('setSize', 'M')"
            :class="['w-6 h-6 rounded-lg text-[10px] font-bold transition', props.size === 'M' && !props.customDiameter ? 'bg-rose-500 text-white' : 'obsidian-btn text-white/70']"
            title="Medium Preset (240px)"
          >
            M
          </button>
          <button
            @click="emit('setSize', 'L')"
            :class="['w-6 h-6 rounded-lg text-[10px] font-bold transition', props.size === 'L' && !props.customDiameter ? 'bg-rose-500 text-white' : 'obsidian-btn text-white/70']"
            title="Large Preset (340px)"
          >
            L
          </button>

          <!-- Freeform Resize Drag Button in Toolbar -->
          <button
            data-resize-handle="true"
            @mousedown.stop="emit('startResize', $event)"
            :class="[
              'w-6 h-6 rounded-lg flex items-center justify-center transition cursor-ew-resize',
              props.customDiameter || props.isResizing ? 'bg-rose-500/30 text-rose-300 border border-rose-400/50' : 'obsidian-btn text-white/70 hover:text-white'
            ]"
            :title="props.customDiameter ? `Custom ${props.customDiameter}px (Drag or Scroll to Resize)` : 'Drag to Custom Resize'"
          >
            <Scaling class="w-3.5 h-3.5" />
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
      </div>
    </transition>
  </div>
</template>
