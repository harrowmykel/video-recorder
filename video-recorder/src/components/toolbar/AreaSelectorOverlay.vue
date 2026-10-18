<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted } from 'vue';
import { Check, X, Crop, Maximize2 } from 'lucide-vue-next';
import type { CaptureAreaRect } from '@/types/studio';

const props = defineProps<{
  isOpen: boolean;
  modelValue: CaptureAreaRect;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', rect: CaptureAreaRect): void;
  (e: 'confirm', rect: CaptureAreaRect): void;
  (e: 'close'): void;
}>();

const rect = ref<CaptureAreaRect>({ ...props.modelValue });
const isDrawing = shallowRef(false);
const isMoving = shallowRef(false);
let startX = 0;
let startY = 0;
let moveOffsetX = 0;
let moveOffsetY = 0;

const boxStyle = computed(() => ({
  left: `${rect.value.x}px`,
  top: `${rect.value.y}px`,
  width: `${rect.value.width}px`,
  height: `${rect.value.height}px`,
}));

function clampRect(r: CaptureAreaRect): CaptureAreaRect {
  const maxW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const maxH = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const w = Math.max(120, Math.min(maxW, Math.round(r.width / 2) * 2));
  const h = Math.max(120, Math.min(maxH, Math.round(r.height / 2) * 2));
  const x = Math.max(0, Math.min(maxW - w, Math.round(r.x)));
  const y = Math.max(0, Math.min(maxH - h, Math.round(r.y)));
  return { x, y, width: w, height: h };
}

function applyPreset(w: number, h: number) {
  const maxW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const maxH = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const clampedW = Math.min(w, maxW - 40);
  const clampedH = Math.min(h, maxH - 80);
  rect.value = clampRect({
    x: Math.round((maxW - clampedW) / 2),
    y: Math.round((maxH - clampedH) / 2),
    width: clampedW,
    height: clampedH,
  });
}

function onBackdropMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('[data-area-controls]')) return;
  if ((e.target as HTMLElement)?.closest('[data-area-box]')) return;
  isDrawing.value = true;
  startX = e.clientX;
  startY = e.clientY;
  rect.value = { x: startX, y: startY, width: 120, height: 120 };
}

function onBoxMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('[data-area-controls]')) return;
  e.stopPropagation();
  isMoving.value = true;
  moveOffsetX = e.clientX - rect.value.x;
  moveOffsetY = e.clientY - rect.value.y;
}

function onMouseMove(e: MouseEvent) {
  if (isDrawing.value) {
    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const width = Math.max(120, Math.abs(e.clientX - startX));
    const height = Math.max(120, Math.abs(e.clientY - startY));
    rect.value = clampRect({ x, y, width, height });
  } else if (isMoving.value) {
    rect.value = clampRect({
      ...rect.value,
      x: e.clientX - moveOffsetX,
      y: e.clientY - moveOffsetY,
    });
  }
}

function onMouseUp() {
  isDrawing.value = false;
  isMoving.value = false;
}

function handleConfirm() {
  const finalRect = clampRect(rect.value);
  emit('update:modelValue', finalRect);
  emit('confirm', finalRect);
}

function onKeyDown(e: KeyboardEvent) {
  if (!props.isOpen) return;
  if (e.key === 'Escape') {
    emit('close');
  } else if (e.key === 'Enter') {
    handleConfirm();
  }
}

onMounted(() => {
  rect.value = clampRect(props.modelValue);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <div
    v-if="props.isOpen"
    @mousedown="onBackdropMouseDown"
    class="fixed inset-0 z-50 bg-black/55 cursor-crosshair select-none font-sans"
  >
    <!-- Top Instruction Banner -->
    <div
      data-area-controls="true"
      class="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl bg-[#0e111a]/95 border border-white/15 shadow-2xl flex items-center gap-4 text-xs text-white"
    >
      <div class="flex items-center gap-2 text-rose-400 font-semibold">
        <Crop class="w-4 h-4" />
        <span>Drag anywhere to draw capture region</span>
      </div>

      <div class="h-4 w-px bg-white/15" />

      <!-- Quick Presets -->
      <div class="flex items-center gap-1.5">
        <button
          @click="applyPreset(1280, 720)"
          class="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-mono transition"
        >
          1280×720 (HD)
        </button>
        <button
          @click="applyPreset(1600, 900)"
          class="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-mono transition"
        >
          1600×900 (16:9)
        </button>
        <button
          @click="applyPreset(1080, 1080)"
          class="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-mono transition"
        >
          1080×1080 (1:1)
        </button>
        <button
          @click="applyPreset(608, 1080)"
          class="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-mono transition"
        >
          9:16 Shorts
        </button>
      </div>
    </div>

    <!-- Active Selection Box -->
    <div
      data-area-box="true"
      @mousedown="onBoxMouseDown"
      :style="boxStyle"
      class="fixed border-2 border-rose-500 bg-rose-500/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] cursor-move flex items-center justify-center"
    >
      <!-- Corner Handles -->
      <span class="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-rose-500 rounded-sm" />
      <span class="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-rose-500 rounded-sm" />
      <span class="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-rose-500 rounded-sm" />
      <span class="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-rose-500 rounded-sm" />

      <!-- Center Dimension Readout & Actions -->
      <div
        data-area-controls="true"
        class="px-4 py-2 rounded-2xl bg-[#0e111a]/95 border border-white/15 shadow-2xl flex items-center gap-3"
      >
        <div class="flex items-center gap-1.5 font-mono text-xs text-white">
          <Maximize2 class="w-3.5 h-3.5 text-rose-400" />
          <span class="font-bold">{{ rect.width }} × {{ rect.height }}</span>
          <span class="text-white/40 text-[10px]">({{ rect.x }}, {{ rect.y }})</span>
        </div>

        <div class="h-4 w-px bg-white/15" />

        <button
          @click="handleConfirm"
          class="px-3 py-1 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold flex items-center gap-1.5 shadow transition"
        >
          <Check class="w-3.5 h-3.5" />
          <span>Confirm Area</span>
        </button>

        <button
          @click="emit('close')"
          class="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition"
          title="Cancel (Esc)"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
