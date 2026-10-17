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
    <!-- Camera Frame (Circle / Squircle / Rect) with Speaking Glow Halo -->
    <div
      @mousedown="emit('dragMouseDown', $event)"
      @wheel.prevent="emit('wheelResize', $event)"
      class="relative overflow-hidden transition-all duration-300 bg-studio-surface cursor-grab active:cursor-grabbing"
      :class="props.shapeClass"
      :style="props.haloStyle"
    >
      <!-- Slot for the shared <video> + real-time segmented <canvas> rendered by parent controller -->
      <slot name="video" />

      <!-- Fallback Avatar if no camera stream and bgMode is off -->
      <div
        v-if="!props.hasCameraStream"
        class="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-white pointer-events-none"
        :class="props.bgMode === 'off' ? 'bg-gradient-to-b from-[#161922] via-[#0e1017] to-[#07080b]' : 'bg-transparent'"
      >
        <div class="relative w-16 h-16 rounded-full bg-rose-500/20 border border-rose-400/30 flex items-center justify-center shadow-lg backdrop-blur-sm">
          <User class="w-8 h-8 text-rose-200" />
          <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-black" />
        </div>
        <span class="text-xs font-semibold text-white/90 mt-2 drop-shadow">FaceCam</span>
        <span class="text-[10px] font-mono text-white/70 drop-shadow">{{ props.isRecording ? 'RAW ISO' : 'Standby' }}</span>
      </div>

      <!-- Active AI Matting / Custom BG Badge -->
      <div
        v-if="props.bgMode !== 'off'"
        class="absolute top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-black/80 border border-white/15 text-[10px] font-medium text-rose-300 flex items-center gap-1 backdrop-blur-md z-10 pointer-events-none"
      >
        <Sparkles class="w-3 h-3" />
        <span class="uppercase">{{ props.bgMode === 'image' ? 'Custom BG' : props.bgMode }}</span>
      </div>
    </div>

    <!-- Floating Dock Beneath the Camera Frame -->
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
        <div
          v-if="props.isResizing"
          class="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/95 text-rose-300 text-[10px] font-mono font-bold border border-rose-500/50 shadow-2xl pointer-events-none whitespace-nowrap"
        >
          {{ props.customDiameter }}px
        </div>

        <div class="flex items-center gap-1 px-2 py-1 rounded-xl obsidian-panel shadow-2xl whitespace-nowrap">
          <!-- Shape (Circle -> Squircle -> 16:9) -->
          <button
            @click="emit('setShape', nextShape())"
            class="w-6 h-6 rounded-lg obsidian-btn flex items-center justify-center text-white/80 hover:text-white"
            title="Cycle Shape (Circle / Squircle / 16:9)"
          >
            <Circle v-if="props.shape === 'circle'" class="w-3.5 h-3.5" />
            <Square v-else-if="props.shape === 'squircle'" class="w-3.5 h-3.5" />
            <RectangleHorizontal v-else class="w-3.5 h-3.5" />
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

          <!-- Freeform Resize Drag Button -->
          <button
            data-resize-handle="true"
            @mousedown.stop="emit('startResize', $event)"
            :class="[
              'w-6 h-6 rounded-lg flex items-center justify-center transition cursor-ew-resize',
              props.customDiameter || props.isResizing ? 'bg-rose-500/30 text-rose-300 border border-rose-400/50' : 'obsidian-btn text-white/70 hover:text-white'
            ]"
            title="Drag to Custom Resize"
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

          <!-- Cycle Background Mode -->
          <button
            @click="emit('toggleBgMode')"
            :class="['w-6 h-6 rounded-lg flex items-center justify-center transition', props.bgMode !== 'off' ? 'bg-rose-500/30 text-rose-300 border border-rose-400/40' : 'obsidian-btn text-white/80']"
            title="Cycle Background Mode (Off / Blur / Cutout / Image / Gradient)"
          >
            <Sparkles class="w-3.5 h-3.5" />
          </button>

          <!-- Choose Custom Background Image -->
          <button
            @click="emit('uploadBgImage')"
            :class="['w-6 h-6 rounded-lg flex items-center justify-center transition', props.bgMode === 'image' ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-400/40' : 'obsidian-btn text-white/80 hover:text-white']"
            title="Upload Custom Background Image"
          >
            <ImagePlus class="w-3.5 h-3.5" />
          </button>

          <!-- Hide Camera Bubble -->
          <button
            @click="emit('hide')"
            class="w-6 h-6 rounded-lg obsidian-btn flex items-center justify-center text-white/60 hover:text-rose-400"
            title="Hide Camera Bubble"
          >
            <EyeOff class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
