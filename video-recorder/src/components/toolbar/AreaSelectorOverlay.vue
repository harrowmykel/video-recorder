<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted } from 'vue';
import { Check, X, Crop, Maximize2, PlusCircle } from 'lucide-vue-next';
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

type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';

interface AspectRatioConfig {
  key: 'custom' | '16:9' | '9:16' | '1:1' | '4:3';
  label: string;
  ratio: number | null;
  width: number;
  height: number;
}

const ratioConfigs: AspectRatioConfig[] = [
  { key: 'custom', label: 'Custom', ratio: null, width: 100, height: 100 },
  { key: '16:9', label: '16:9', ratio: 16 / 9, width: 1920, height: 1080 },
  { key: '9:16', label: '9:16', ratio: 9 / 16, width: 608, height: 1080 },
  { key: '1:1', label: '1:1', ratio: 1, width: 1080, height: 1080 },
  { key: '4:3', label: '4:3', ratio: 4 / 3, width: 1280, height: 960 },
];

function detectRatio(w: number, h: number): AspectRatioConfig {

  function _detectRatioKey(w: number, h: number): string {
    if (!h || !w) return 'custom';
    const r = w / h;
    if (Math.abs(r - 16 / 9) < 0.04) return '16:9';
    if (Math.abs(r - 9 / 16) < 0.04) return '9:16';
    if (Math.abs(r - 1) < 0.04) return '1:1';
    if (Math.abs(r - 4 / 3) < 0.04) return '4:3';
    return 'custom';
  }
  const key = _detectRatioKey(w, h);
  for (const cfg of ratioConfigs) {
    if (cfg.key === key) return cfg;
  }
  return ratioConfigs[0];
}

const selectedRatio = shallowRef<AspectRatioConfig>(detectRatio(props.modelValue.width, props.modelValue.height));

const currentNumericRatio = computed<number | null>(() => {
  const cfg = ratioConfigs.find((c) => c.key === selectedRatio.value.key);
  return cfg ? cfg.ratio : null;
});

const selectedRatioLabel = computed(() => {
  if (selectedRatio.value.key === 'custom') return 'Custom';
  return selectedRatio.value.label;
});

const rect = ref<CaptureAreaRect>({ ...props.modelValue });
const isDrawing = shallowRef(false);
const isMoving = shallowRef(false);
const isResizing = shallowRef(false);
const activeHandle = shallowRef<ResizeHandle | null>(null);
const isRedrawMode = shallowRef(false);

let startX = 0;
let startY = 0;
let moveOffsetX = 0;
let moveOffsetY = 0;
let initialRect: CaptureAreaRect = { x: 0, y: 0, width: 0, height: 0 };
let initialMouseX = 0;
let initialMouseY = 0;

const boxStyle = computed(() => ({
  left: `${rect.value.x}px`,
  top: `${rect.value.y}px`,
  width: `${rect.value.width}px`,
  height: `${rect.value.height}px`,
}));

function clampRect(r: CaptureAreaRect): CaptureAreaRect {
  const maxW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const maxH = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const minSize = 120;
  const w = Math.max(minSize, Math.min(maxW, Math.round(r.width / 2) * 2));
  const h = Math.max(minSize, Math.min(maxH, Math.round(r.height / 2) * 2));
  const x = Math.max(0, Math.min(maxW - w, Math.round(r.x)));
  const y = Math.max(0, Math.min(maxH - h, Math.round(r.y)));
  return { x, y, width: w, height: h };
}

function selectRatio(preset: AspectRatioConfig) {
  selectedRatio.value = preset;
  const cfg = ratioConfigs.find((c) => c.key === preset.key);
  if (!cfg || cfg.ratio === null) {
    return;
  }
  const targetRatio = cfg.ratio;
  const maxW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const maxH = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const centerX = rect.value.x + rect.value.width / 2;
  const centerY = rect.value.y + rect.value.height / 2;

  let newW = rect.value.width;
  let newH = Math.round(newW / targetRatio);

  if (newH > maxH - 80) {
    newH = maxH - 80;
    newW = Math.round(newH * targetRatio);
  }
  if (newW > maxW - 40) {
    newW = maxW - 40;
    newH = Math.round(newW / targetRatio);
  }

  newW = Math.round(newW / 2) * 2;
  newH = Math.round(newH / 2) * 2;

  rect.value = clampRect({
    x: Math.round(centerX - newW / 2),
    y: Math.round(centerY - newH / 2),
    width: newW,
    height: newH,
  });
}

function applyPreset(preset: AspectRatioConfig) {
  const maxW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const maxH = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const clampedW = Math.min(preset.width, maxW - 40);
  const clampedH = Math.min(preset.height, maxH - 80);
  rect.value = clampRect({
    x: Math.round((maxW - clampedW) / 2),
    y: Math.round((maxH - clampedH) / 2),
    width: clampedW,
    height: clampedH,
  });
  if (preset.ratio !== null) {
    selectedRatio.value = preset;
  } else {
    selectedRatio.value = detectRatio(clampedW, clampedH);
  }
}

function onBackdropMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('[data-area-controls]')) return;
  if ((e.target as HTMLElement)?.closest('[data-area-handle]')) return;
  if ((e.target as HTMLElement)?.closest('[data-area-box]') && !isRedrawMode.value && !e.shiftKey) return;

  isDrawing.value = true;
  startX = e.clientX;
  startY = e.clientY;
  rect.value = { x: startX, y: startY, width: 120, height: 120 };
}

function onBoxMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('[data-area-controls]')) return;
  if ((e.target as HTMLElement)?.closest('[data-area-handle]')) return;

  // If in redraw mode or holding Shift, start drawing a new area directly within this box
  if (isRedrawMode.value || e.shiftKey) {
    onBackdropMouseDown(e);
    return;
  }

  e.stopPropagation();
  isMoving.value = true;
  moveOffsetX = e.clientX - rect.value.x;
  moveOffsetY = e.clientY - rect.value.y;
}

function onHandleMouseDown(e: MouseEvent, handle: ResizeHandle) {
  e.stopPropagation();
  e.preventDefault();
  isResizing.value = true;
  activeHandle.value = handle;
  initialRect = { ...rect.value };
  initialMouseX = e.clientX;
  initialMouseY = e.clientY;
}

function onMouseMove(e: MouseEvent) {
  const minSize = 120;
  const maxW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const maxH = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const targetRatio = currentNumericRatio.value;

  if (isDrawing.value) {
    const rawDx = e.clientX - startX;
    const rawDy = e.clientY - startY;
    const signX = rawDx >= 0 ? 1 : -1;
    const signY = rawDy >= 0 ? 1 : -1;
    let width = Math.max(minSize, Math.abs(rawDx));
    let height = Math.max(minSize, Math.abs(rawDy));

    if (targetRatio !== null) {
      if (Math.abs(rawDx) >= Math.abs(rawDy) * targetRatio) {
        width = Math.max(minSize, Math.abs(rawDx));
        height = Math.max(minSize, Math.round(width / targetRatio));
      } else {
        height = Math.max(minSize, Math.abs(rawDy));
        width = Math.max(minSize, Math.round(height * targetRatio));
      }
    }

    const x = signX >= 0 ? startX : startX - width;
    const y = signY >= 0 ? startY : startY - height;
    rect.value = clampRect({ x, y, width, height });
  } else if (isMoving.value) {
    rect.value = clampRect({
      ...rect.value,
      x: e.clientX - moveOffsetX,
      y: e.clientY - moveOffsetY,
    });
  } else if (isResizing.value && activeHandle.value) {
    const dx = e.clientX - initialMouseX;
    const dy = e.clientY - initialMouseY;

    let newX = initialRect.x;
    let newY = initialRect.y;
    let newW = initialRect.width;
    let newH = initialRect.height;

    if (targetRatio !== null) {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      switch (activeHandle.value) {
        case 'br': {
          if (absDx >= absDy * targetRatio) {
            newW = Math.max(minSize, initialRect.width + dx);
            newH = Math.max(minSize, Math.round(newW / targetRatio));
          } else {
            newH = Math.max(minSize, initialRect.height + dy);
            newW = Math.max(minSize, Math.round(newH * targetRatio));
          }
          if (initialRect.x + newW > maxW) {
            newW = maxW - initialRect.x;
            newH = Math.round(newW / targetRatio);
          }
          if (initialRect.y + newH > maxH) {
            newH = maxH - initialRect.y;
            newW = Math.round(newH * targetRatio);
          }
          newX = initialRect.x;
          newY = initialRect.y;
          break;
        }
        case 'tl': {
          const fixedRight = initialRect.x + initialRect.width;
          const fixedBottom = initialRect.y + initialRect.height;
          if (absDx >= absDy * targetRatio) {
            newW = Math.max(minSize, initialRect.width - dx);
            newH = Math.max(minSize, Math.round(newW / targetRatio));
          } else {
            newH = Math.max(minSize, initialRect.height - dy);
            newW = Math.max(minSize, Math.round(newH * targetRatio));
          }
          if (fixedRight - newW < 0) {
            newW = fixedRight;
            newH = Math.round(newW / targetRatio);
          }
          if (fixedBottom - newH < 0) {
            newH = fixedBottom;
            newW = Math.round(newH * targetRatio);
          }
          newX = fixedRight - newW;
          newY = fixedBottom - newH;
          break;
        }
        case 'tr': {
          const fixedLeft = initialRect.x;
          const fixedBottom = initialRect.y + initialRect.height;
          if (absDx >= absDy * targetRatio) {
            newW = Math.max(minSize, initialRect.width + dx);
            newH = Math.max(minSize, Math.round(newW / targetRatio));
          } else {
            newH = Math.max(minSize, initialRect.height - dy);
            newW = Math.max(minSize, Math.round(newH * targetRatio));
          }
          if (fixedLeft + newW > maxW) {
            newW = maxW - fixedLeft;
            newH = Math.round(newW / targetRatio);
          }
          if (fixedBottom - newH < 0) {
            newH = fixedBottom;
            newW = Math.round(newH * targetRatio);
          }
          newX = fixedLeft;
          newY = fixedBottom - newH;
          break;
        }
        case 'bl': {
          const fixedRight = initialRect.x + initialRect.width;
          const fixedTop = initialRect.y;
          if (absDx >= absDy * targetRatio) {
            newW = Math.max(minSize, initialRect.width - dx);
            newH = Math.max(minSize, Math.round(newW / targetRatio));
          } else {
            newH = Math.max(minSize, initialRect.height + dy);
            newW = Math.max(minSize, Math.round(newH * targetRatio));
          }
          if (fixedRight - newW < 0) {
            newW = fixedRight;
            newH = Math.round(newW / targetRatio);
          }
          if (fixedTop + newH > maxH) {
            newH = maxH - fixedTop;
            newW = Math.round(newH * targetRatio);
          }
          newX = fixedRight - newW;
          newY = fixedTop;
          break;
        }
        case 'r': {
          newW = Math.max(minSize, initialRect.width + dx);
          newH = Math.max(minSize, Math.round(newW / targetRatio));
          const deltaH = newH - initialRect.height;
          newX = initialRect.x;
          newY = initialRect.y - Math.round(deltaH / 2);
          if (newX + newW > maxW) {
            newW = maxW - newX;
            newH = Math.round(newW / targetRatio);
            newY = initialRect.y - Math.round((newH - initialRect.height) / 2);
          }
          if (newY < 0) newY = 0;
          if (newY + newH > maxH) newY = maxH - newH;
          break;
        }
        case 'l': {
          newW = Math.max(minSize, initialRect.width - dx);
          newH = Math.max(minSize, Math.round(newW / targetRatio));
          const deltaH = newH - initialRect.height;
          newX = initialRect.x + initialRect.width - newW;
          newY = initialRect.y - Math.round(deltaH / 2);
          if (newX < 0) {
            newW = initialRect.x + initialRect.width;
            newH = Math.round(newW / targetRatio);
            newX = 0;
            newY = initialRect.y - Math.round((newH - initialRect.height) / 2);
          }
          if (newY < 0) newY = 0;
          if (newY + newH > maxH) newY = maxH - newH;
          break;
        }
        case 'b': {
          newH = Math.max(minSize, initialRect.height + dy);
          newW = Math.max(minSize, Math.round(newH * targetRatio));
          const deltaW = newW - initialRect.width;
          newX = initialRect.x - Math.round(deltaW / 2);
          newY = initialRect.y;
          if (newY + newH > maxH) {
            newH = maxH - newY;
            newW = Math.round(newH * targetRatio);
            newX = initialRect.x - Math.round((newW - initialRect.width) / 2);
          }
          if (newX < 0) newX = 0;
          if (newX + newW > maxW) newX = maxW - newW;
          break;
        }
        case 't': {
          newH = Math.max(minSize, initialRect.height - dy);
          newW = Math.max(minSize, Math.round(newH * targetRatio));
          const deltaW = newW - initialRect.width;
          newX = initialRect.x - Math.round(deltaW / 2);
          newY = initialRect.y + initialRect.height - newH;
          if (newY < 0) {
            newH = initialRect.y + initialRect.height;
            newW = Math.round(newH * targetRatio);
            newY = 0;
            newX = initialRect.x - Math.round((newW - initialRect.width) / 2);
          }
          if (newX < 0) newX = 0;
          if (newX + newW > maxW) newX = maxW - newW;
          break;
        }
      }
    } else {
      switch (activeHandle.value) {
        case 'tl':
          newX = Math.min(initialRect.x + initialRect.width - minSize, Math.max(0, initialRect.x + dx));
          newY = Math.min(initialRect.y + initialRect.height - minSize, Math.max(0, initialRect.y + dy));
          newW = initialRect.width - (newX - initialRect.x);
          newH = initialRect.height - (newY - initialRect.y);
          break;
        case 'tr':
          newY = Math.min(initialRect.y + initialRect.height - minSize, Math.max(0, initialRect.y + dy));
          newW = Math.max(minSize, Math.min(maxW - initialRect.x, initialRect.width + dx));
          newH = initialRect.height - (newY - initialRect.y);
          break;
        case 'bl':
          newX = Math.min(initialRect.x + initialRect.width - minSize, Math.max(0, initialRect.x + dx));
          newW = initialRect.width - (newX - initialRect.x);
          newH = Math.max(minSize, Math.min(maxH - initialRect.y, initialRect.height + dy));
          break;
        case 'br':
          newW = Math.max(minSize, Math.min(maxW - initialRect.x, initialRect.width + dx));
          newH = Math.max(minSize, Math.min(maxH - initialRect.y, initialRect.height + dy));
          break;
        case 't':
          newY = Math.min(initialRect.y + initialRect.height - minSize, Math.max(0, initialRect.y + dy));
          newH = initialRect.height - (newY - initialRect.y);
          break;
        case 'b':
          newH = Math.max(minSize, Math.min(maxH - initialRect.y, initialRect.height + dy));
          break;
        case 'l':
          newX = Math.min(initialRect.x + initialRect.width - minSize, Math.max(0, initialRect.x + dx));
          newW = initialRect.width - (newX - initialRect.x);
          break;
        case 'r':
          newW = Math.max(minSize, Math.min(maxW - initialRect.x, initialRect.width + dx));
          break;
      }
    }

    rect.value = clampRect({
      x: newX,
      y: newY,
      width: newW,
      height: newH,
    });
  }
}

function onMouseUp() {
  if (isDrawing.value && isRedrawMode.value) {
    isRedrawMode.value = false;
  }
  isDrawing.value = false;
  isMoving.value = false;
  isResizing.value = false;
  activeHandle.value = null;
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
  selectedRatio.value = detectRatio(rect.value.width, rect.value.height);
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
  <div v-if="props.isOpen" @mousedown="onBackdropMouseDown"
    class="fixed inset-0 z-50 bg-black/55 cursor-crosshair select-none font-sans">
    <!-- Top Instruction Banner -->
    <div data-area-controls="true"
      class="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl bg-[#0e111a]/95 border border-white/15 shadow-2xl flex items-center gap-4 text-xs text-white">
      <div class="flex items-center gap-2 text-rose-400 font-semibold">
        <Crop class="w-4 h-4" />
        <span>Drag edges & corners to resize, or drag center to move</span>
      </div>

      <div class="h-4 w-px bg-white/15" />

      <!-- Draw New Area Action Button -->
      <button @click="isRedrawMode = !isRedrawMode"
        class="px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition border"
        :class="isRedrawMode ? 'bg-rose-500 text-white border-rose-400 shadow-md' : 'bg-white/10 hover:bg-white/20 text-white/90 border-white/10'"
        title="Toggle Redraw: Drag anywhere (even inside the box) to draw a new area">
        <PlusCircle class="w-3.5 h-3.5" />
        <span>{{ isRedrawMode ? 'Drawing Mode Active' : 'Draw New Area' }}</span>
      </button>

      <div class="h-4 w-px bg-white/15" />

      <!-- Ratio Selector & Quick Presets -->
      <div class="flex items-center gap-2">
        <span class="text-white/50 text-[11px] font-medium">Ratio:</span>
        <div class="flex items-center gap-1 bg-white/10 p-0.5 rounded-lg border border-white/10">
          <button v-for="cfg in ratioConfigs" :key="cfg.key" @click="selectRatio(cfg)"
            class="px-2 py-0.5 rounded-md text-[11px] font-semibold transition"
            :class="selectedRatio.key === cfg.key ? 'bg-rose-500 text-white shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'">
            {{ cfg.label }}
          </button>
        </div>
      </div>

      <div class="h-4 w-px bg-white/15" />

      <!-- Quick Resolution Presets -->
      <div class="flex items-center gap-1.5">
        <button v-for="preset in ratioConfigs" :key="preset.key" @click="applyPreset(preset)"
          class="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-mono transition"
          :title="preset.label">
          {{ preset.label }} ({{ preset.width }}×{{ preset.height }})
        </button>
      </div>
    </div>

    <!-- Active Selection Box -->
    <div data-area-box="true" @mousedown="onBoxMouseDown" :style="boxStyle"
      class="fixed border-2 border-rose-500 bg-rose-500/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] cursor-move flex items-center justify-center select-none">
      <!-- 4 Interactive Corner Handles -->
      <div data-area-handle="true" @mousedown="onHandleMouseDown($event, 'tl')"
        class="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-rose-500 rounded-sm cursor-nwse-resize shadow-md hover:scale-125 transition-transform z-10"
        title="Resize Top-Left" />
      <div data-area-handle="true" @mousedown="onHandleMouseDown($event, 'tr')"
        class="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-rose-500 rounded-sm cursor-nesw-resize shadow-md hover:scale-125 transition-transform z-10"
        title="Resize Top-Right" />
      <div data-area-handle="true" @mousedown="onHandleMouseDown($event, 'bl')"
        class="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-rose-500 rounded-sm cursor-nesw-resize shadow-md hover:scale-125 transition-transform z-10"
        title="Resize Bottom-Left" />
      <div data-area-handle="true" @mousedown="onHandleMouseDown($event, 'br')"
        class="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-rose-500 rounded-sm cursor-nwse-resize shadow-md hover:scale-125 transition-transform z-10"
        title="Resize Bottom-Right" />

      <!-- 4 Interactive Edge Handles -->
      <div data-area-handle="true" @mousedown="onHandleMouseDown($event, 't')"
        class="absolute -top-1.5 left-1/2 -translate-x-1/2 w-10 h-3 bg-white border-2 border-rose-500 rounded-full cursor-ns-resize shadow-md hover:scale-110 transition-transform z-10"
        title="Resize Top Edge" />
      <div data-area-handle="true" @mousedown="onHandleMouseDown($event, 'b')"
        class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-10 h-3 bg-white border-2 border-rose-500 rounded-full cursor-ns-resize shadow-md hover:scale-110 transition-transform z-10"
        title="Resize Bottom Edge" />
      <div data-area-handle="true" @mousedown="onHandleMouseDown($event, 'l')"
        class="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-10 bg-white border-2 border-rose-500 rounded-full cursor-ew-resize shadow-md hover:scale-110 transition-transform z-10"
        title="Resize Left Edge" />
      <div data-area-handle="true" @mousedown="onHandleMouseDown($event, 'r')"
        class="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-10 bg-white border-2 border-rose-500 rounded-full cursor-ew-resize shadow-md hover:scale-110 transition-transform z-10"
        title="Resize Right Edge" />

      <!-- Center Dimension Readout & Actions -->
      <div data-area-controls="true"
        class="px-4 py-2 rounded-2xl bg-[#0e111a]/95 border border-white/15 shadow-2xl flex items-center gap-3 z-20 pointer-events-auto">
        <div class="flex items-center gap-1.5 font-mono text-xs text-white">
          <Maximize2 class="w-3.5 h-3.5 text-rose-400" />
          <span class="font-bold">{{ rect.width }} × {{ rect.height }}</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold tracking-wide"
            :class="selectedRatio.key !== 'custom' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-white/10 text-white/50'">
            {{ selectedRatioLabel }}
          </span>
          <span class="text-white/40 text-[10px]">({{ rect.x }}, {{ rect.y }})</span>
        </div>

        <div class="h-4 w-px bg-white/15" />

        <button @click="isRedrawMode = !isRedrawMode"
          class="px-2 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1 transition"
          :class="isRedrawMode ? 'bg-rose-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'"
          title="Redraw new box">
          <PlusCircle class="w-3 h-3" />
          <span>New</span>
        </button>

        <button @click="handleConfirm"
          class="px-3 py-1 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold flex items-center gap-1.5 shadow transition">
          <Check class="w-3.5 h-3.5" />
          <span>Confirm Area</span>
        </button>

        <button @click="emit('close')"
          class="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition"
          title="Cancel (Esc)">
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
