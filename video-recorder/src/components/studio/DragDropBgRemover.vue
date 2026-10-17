<script setup lang="ts">
import { ref } from 'vue';
import {
  UploadCloud,
  FileVideo,
  Sparkles,
  CheckCircle2,
  Trash2,
  Layers,
  Cpu,
  Download
} from 'lucide-vue-next';
import { BatchMattingJob, BgModelType } from '../../types/studio';

const jobs = ref<BatchMattingJob[]>([
  {
    id: 'job_sample_1',
    fileName: 'camera_portrait_take.mp4',
    filePath: '/recordings/camera_portrait_take.mp4',
    fileSizeBytes: 64200000,
    status: 'completed',
    progressPct: 100,
    fps: 34,
    etaSeconds: 0,
    outputFormat: 'prores_4444',
    outputPath: '/recordings/camera_portrait_take_transparent.mov',
  },
]);

const isDragging = ref(false);
const selectedModel = ref<BgModelType>('birefnet_hq');
const defaultFormat = ref<'prores_4444' | 'webm_alpha' | 'luma_matte'>('prores_4444');

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}

function handleDragLeave() {
  isDragging.value = false;
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  if (!e.dataTransfer?.files) return;

  const files = Array.from(e.dataTransfer.files);
  files.forEach((file) => {
    const newJob: BatchMattingJob = {
      id: `job_${Date.now()}_${Math.random()}`,
      fileName: file.name,
      filePath: (file as unknown as { path?: string }).path || `/recordings/${file.name}`,
      fileSizeBytes: file.size,
      status: 'queued',
      progressPct: 0,
      fps: 0,
      etaSeconds: 30,
      outputFormat: defaultFormat.value,
    };
    jobs.value.unshift(newJob);
    simulateProcessing(newJob.id);
  });
}

function simulateProcessing(jobId: string) {
  let progress = 0;
  const interval = setInterval(() => {
    progress += 12;
    const target = jobs.value.find((j) => j.id === jobId);
    if (!target) {
      clearInterval(interval);
      return;
    }
    if (progress >= 100) {
      clearInterval(interval);
      target.status = 'completed';
      target.progressPct = 100;
      target.outputPath = target.filePath.replace(/\.[^/.]+$/, '_transparent.mov');
    } else {
      target.status = 'processing';
      target.progressPct = progress;
      target.fps = 30 + Math.floor(Math.random() * 8);
      target.etaSeconds = Math.max(1, Math.round((100 - progress) / 3));
    }
  }, 500);
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function removeJob(id: string) {
  jobs.value = jobs.value.filter((j) => j.id !== id);
}
</script>

<template>
  <div class="space-y-6">
    <!-- Top Configuration Bar -->
    <div class="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl glass-card border border-white/10">
      <div class="flex items-center space-x-3">
        <div class="p-2 rounded-lg bg-studio-indigo/20 text-studio-indigo">
          <Sparkles class="w-5 h-5" />
        </div>
        <div>
          <h3 class="text-sm font-semibold text-white">AI Matting & Segmentation Engine</h3>
          <p class="text-xs text-gray-400">Choose model accuracy and transparent export container</p>
        </div>
      </div>

      <div class="flex items-center space-x-3">
        <!-- Model Selector -->
        <div class="flex items-center space-x-2 bg-studio-dark/80 px-3 py-1.5 rounded-lg border border-white/10">
          <Cpu class="w-3.5 h-3.5 text-studio-indigo" />
          <select
            v-model="selectedModel"
            class="bg-transparent text-xs text-gray-200 outline-none cursor-pointer"
          >
            <option value="birefnet_hq" class="bg-studio-slate">Studio HQ: BiRefNet (Hair-level)</option>
            <option value="rmbg_1_4" class="bg-studio-slate">Studio HQ: RMBG-1.4 (Accurate)</option>
            <option value="rvm_video" class="bg-studio-slate">Video Matting: RVM (Temporal Sync)</option>
            <option value="mediapipe_fast" class="bg-studio-slate">Fast Realtime: MediaPipe</option>
          </select>
        </div>

        <!-- Format Selector -->
        <div class="flex items-center space-x-2 bg-studio-dark/80 px-3 py-1.5 rounded-lg border border-white/10">
          <Layers class="w-3.5 h-3.5 text-emerald-400" />
          <select
            v-model="defaultFormat"
            class="bg-transparent text-xs text-gray-200 outline-none cursor-pointer"
          >
            <option value="prores_4444" class="bg-studio-slate">Apple ProRes 4444 (.mov)</option>
            <option value="webm_alpha" class="bg-studio-slate">WebM VP9 Alpha (.webm)</option>
            <option value="luma_matte" class="bg-studio-slate">Luma Matte Mask (.mp4)</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Drag & Drop Zone -->
    <div
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      class="border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer"
      :class="[
        isDragging
          ? 'border-studio-indigo bg-studio-indigo/10 scale-[1.01]'
          : 'border-white/15 hover:border-white/30 bg-studio-slate/40'
      ]"
    >
      <UploadCloud class="w-12 h-12 text-studio-indigo mx-auto mb-3 animate-bounce" />
      <h4 class="text-base font-semibold text-white mb-1">
        Drag & drop any camera video here
      </h4>
      <p class="text-xs text-gray-400 max-w-sm mx-auto">
        Supports MP4, MOV, MKV, and WebM. Automatically segments portraits and generates transparent video for Premiere, DaVinci, or Final Cut.
      </p>
    </div>

    <!-- Batch Queue -->
    <div class="space-y-3">
      <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Extraction Queue ({{ jobs.length }})
      </h4>

      <div
        v-for="job in jobs"
        :key="job.id"
        class="p-3.5 rounded-xl glass-card flex items-center justify-between gap-4 border border-white/5"
      >
        <div class="flex items-center space-x-3 min-w-0">
          <div class="p-2.5 rounded-lg bg-white/5 text-gray-300">
            <FileVideo class="w-5 h-5 text-studio-indigo" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center space-x-2">
              <span class="text-sm font-medium text-white truncate max-w-xs">
                {{ job.fileName }}
              </span>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-gray-300 uppercase">
                {{ job.outputFormat.replace('_', ' ') }}
              </span>
            </div>
            <div class="flex items-center space-x-3 text-xs text-gray-400 mt-1">
              <span>{{ formatBytes(job.fileSizeBytes) }}</span>
              <template v-if="job.status === 'processing'">
                <span>•</span>
                <span class="text-studio-indigo">{{ job.fps }} FPS</span>
                <span>•</span>
                <span>ETA {{ job.etaSeconds }}s</span>
              </template>
              <template v-if="job.status === 'completed'">
                <span>•</span>
                <span class="text-studio-emerald flex items-center space-x-1">
                  <CheckCircle2 class="w-3 h-3" />
                  <span>Ready for Video Editor</span>
                </span>
              </template>
            </div>
          </div>
        </div>

        <div class="flex items-center space-x-4">
          <!-- Progress bar -->
          <div v-if="job.status === 'processing'" class="w-32">
            <div class="flex justify-between text-[11px] font-mono text-gray-400 mb-1">
              <span>Rendering</span>
              <span>{{ job.progressPct }}%</span>
            </div>
            <div class="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div
                class="h-full bg-studio-indigo rounded-full transition-all duration-300"
                :style="{ width: `${job.progressPct}%` }"
              />
            </div>
          </div>

          <!-- Reveal Action -->
          <button
            v-if="job.status === 'completed'"
            @click="alert(`Exported transparent video: ${job.outputPath}`)"
            class="flex items-center space-x-1.5 px-3 py-1.5 bg-studio-emerald/20 hover:bg-studio-emerald/30 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs font-medium transition-colors"
          >
            <Download class="w-3.5 h-3.5" />
            <span>Reveal File</span>
          </button>

          <!-- Remove -->
          <button
            @click="removeJob(job.id)"
            class="p-1.5 text-gray-400 hover:text-red-400 rounded-lg transition-colors"
            title="Remove from queue"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
