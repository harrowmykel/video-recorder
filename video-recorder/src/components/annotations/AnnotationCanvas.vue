<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted, watch, useTemplateRef, nextTick } from 'vue';
import {
  Pen,
  ArrowRight,
  Square,
  Circle,
  Sun,
  Trash2,
  X,
  Clock
} from 'lucide-vue-next';
import { AnnotationTool, AnnotationItem } from '@/types/studio';

const props = defineProps<{
  isActive: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const currentTool = shallowRef<AnnotationTool>('pen');
const currentColor = shallowRef<string>('#EF4444');
const strokeWidth = shallowRef<number>(4);
const autoFade = shallowRef<boolean>(true);
const annotations = ref<AnnotationItem[]>([]);
const isDrawing = shallowRef<boolean>(false);
const spotlightPos = shallowRef<{ x: number; y: number } | null>(null);

// Extensible shape cycle list: easy to add more shapes (e.g. 'triangle', 'star')
const SHAPE_CYCLE: AnnotationTool[] = ['rect', 'circle'];
const isShapeActive = computed(() => SHAPE_CYCLE.includes(currentTool.value));

function cycleShapeTool() {
  const currentIdx = SHAPE_CYCLE.indexOf(currentTool.value);
  if (currentIdx === -1) {
    // Activate first shape
    currentTool.value = SHAPE_CYCLE[0];
  } else if (currentIdx + 1 < SHAPE_CYCLE.length) {
    // Advance to next shape
    currentTool.value = SHAPE_CYCLE[currentIdx + 1];
  } else {
    // Deactivate shape, revert to default pen
    currentTool.value = 'pen';
  }
}

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');
let activeItem: AnnotationItem | null = null;
let autoFadeInterval: ReturnType<typeof setInterval> | null = null;

function handleResize() {
  if (canvasRef.value) {
    canvasRef.value.width = window.innerWidth;
    canvasRef.value.height = window.innerHeight;
    redraw();
  }
}

watch(
  () => props.isActive,
  (active) => {
    if (active) {
      nextTick(() => {
        handleResize();
      });
    }
  }
);

onMounted(() => {
  handleResize();
  window.addEventListener('resize', handleResize);

  autoFadeInterval = setInterval(() => {
    if (!autoFade.value || annotations.value.length === 0) return;
    const now = Date.now();
    const prevLen = annotations.value.length;
    annotations.value = annotations.value.filter((a) => now - a.createdAt < 3500);
    if (annotations.value.length !== prevLen) {
      redraw();
    }
  }, 500);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (autoFadeInterval) clearInterval(autoFadeInterval);
});

watch([currentTool, spotlightPos], () => {
  redraw();
});

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  width: number
) {
  const headLen = 14 + width * 2;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const angle = Math.atan2(dy, dx);

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function redraw() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Spotlight Dimmer
  if (currentTool.value === 'spotlight' && spotlightPos.value) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(spotlightPos.value.x, spotlightPos.value.y, 140, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw annotations
  annotations.value.forEach((item) => {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (item.tool === 'pen' && item.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(item.points[0].x, item.points[0].y);
      for (let i = 1; i < item.points.length; i++) {
        ctx.lineTo(item.points[i].x, item.points[i].y);
      }
      ctx.stroke();
    } else if (item.tool === 'rect' && item.points.length >= 2) {
      const p1 = item.points[0];
      const p2 = item.points[item.points.length - 1];
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    } else if (item.tool === 'circle' && item.points.length >= 2) {
      const p1 = item.points[0];
      const p2 = item.points[item.points.length - 1];
      const rx = Math.abs(p2.x - p1.x) / 2;
      const ry = Math.abs(p2.y - p1.y) / 2;
      const cx = Math.min(p1.x, p2.x) + rx;
      const cy = Math.min(p1.y, p2.y) + ry;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (item.tool === 'arrow' && item.points.length >= 2) {
      const from = item.points[0];
      const to = item.points[item.points.length - 1];
      drawArrow(ctx, from.x, from.y, to.x, to.y, item.strokeWidth);
    }
  });
}

function handleMouseDown(e: MouseEvent) {
  if (currentTool.value === 'spotlight') return;
  isDrawing.value = true;
  activeItem = {
    id: Math.random().toString(),
    tool: currentTool.value,
    color: currentColor.value,
    strokeWidth: strokeWidth.value,
    points: [{ x: e.clientX, y: e.clientY }],
    createdAt: Date.now(),
  };
  annotations.value.push(activeItem);
  redraw();
}

function handleMouseMove(e: MouseEvent) {
  if (currentTool.value === 'spotlight') {
    spotlightPos.value = { x: e.clientX, y: e.clientY };
    return;
  }
  if (!isDrawing.value || !activeItem) return;

  activeItem.points.push({ x: e.clientX, y: e.clientY });
  redraw();
}

function handleMouseUp() {
  isDrawing.value = false;
  activeItem = null;
}

const colors = ['#EF4444', '#F59E0B', '#10B981', '#6366F1', '#FFFFFF'];
</script>

<template>
  <div v-if="isActive" class="fixed inset-0 z-40 select-none">
    <!-- Interactive Canvas -->
    <canvas
      ref="canvasRef"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      class="w-full h-full cursor-crosshair"
    />

    <!-- Floating Drawing Palette -->
    <div class="fixed top-6 left-1/2 -translate-x-1/2 glass-pill px-4 py-2 rounded-2xl flex items-center space-x-3 shadow-2xl z-50 text-white">
      <div class="flex items-center space-x-1">
        <button
          @click="currentTool = 'pen'"
          class="p-1.5 rounded-lg transition-colors"
          :class="currentTool === 'pen' ? 'bg-studio-indigo text-white' : 'text-gray-400 hover:text-white'"
          title="Pen"
        >
          <Pen class="w-4 h-4" />
        </button>
        <button
          @click="currentTool = 'arrow'"
          class="p-1.5 rounded-lg transition-colors"
          :class="currentTool === 'arrow' ? 'bg-studio-indigo text-white' : 'text-gray-400 hover:text-white'"
          title="Arrow"
        >
          <ArrowRight class="w-4 h-4" />
        </button>
        <button
          @click="cycleShapeTool"
          class="p-1.5 rounded-lg transition-colors flex items-center justify-center"
          :class="isShapeActive ? 'bg-studio-indigo text-white ring-1 ring-white/30' : 'text-gray-400 hover:text-white'"
          :title="currentTool === 'rect' ? 'Shape: Rectangle (Click for Circle)' : currentTool === 'circle' ? 'Shape: Circle (Click to Deactivate)' : 'Shape Tool (Rectangle / Circle)'"
        >
          <Circle v-if="currentTool === 'circle'" class="w-4 h-4" />
          <Square v-else class="w-4 h-4" />
        </button>
        <button
          @click="currentTool = 'spotlight'"
          class="p-1.5 rounded-lg transition-colors"
          :class="currentTool === 'spotlight' ? 'bg-studio-indigo text-white' : 'text-gray-400 hover:text-white'"
          title="Spotlight Dimmer"
        >
          <Sun class="w-4 h-4" />
        </button>
      </div>

      <div class="h-4 w-px bg-white/10" />

      <!-- Color Swatches -->
      <div class="flex items-center space-x-1.5">
        <button
          v-for="c in colors"
          :key="c"
          @click="currentColor = c"
          :style="{ backgroundColor: c }"
          class="w-4 h-4 rounded-full transition-transform"
          :class="currentColor === c ? 'scale-125 ring-2 ring-white' : 'opacity-80 hover:opacity-100'"
        />
      </div>

      <div class="h-4 w-px bg-white/10" />

      <!-- Auto-Fade Toggle -->
      <button
        @click="autoFade = !autoFade"
        class="flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors"
        :class="autoFade ? 'bg-studio-emerald/20 border-emerald-500/30 text-emerald-300' : 'bg-black/30 border-white/10 text-gray-400'"
        title="Toggle Auto-Fade (Drawings vanish after 3s)"
      >
        <Clock class="w-3 h-3" />
        <span>Auto-Fade</span>
      </button>

      <!-- Clear Drawings -->
      <button
        @click="annotations = []; redraw();"
        class="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
        title="Clear all drawings"
      >
        <Trash2 class="w-4 h-4" />
      </button>

      <div class="h-4 w-px bg-white/10" />

      <!-- Close Palette -->
      <button
        @click="emit('close')"
        class="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
        title="Close Annotations (Ctrl+Shift+A)"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
