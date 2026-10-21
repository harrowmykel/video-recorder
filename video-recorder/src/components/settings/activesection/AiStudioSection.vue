<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, useTemplateRef } from 'vue';
import {
  UploadCloud,
  Sparkles,
  CheckCircle2,
  Trash2,
  Download,
  Film,
  FolderOpen,
  AlertCircle,
  RotateCcw,
  Loader2,
  ChevronDown,
  Zap,
  Layers,
  Cpu,
  XCircle,
} from 'lucide-vue-next';
import type { BatchMattingJob, BgModelType } from '@/types/studio';
import {
  STUDIO_BG_REMOVER_DIR,
  getDefaultBgRemoverDirectory,
  openExportDirectory,
  revealInFolder,
  selectVideoFiles,
  getFilePathForFile,
  readFileBuffer,
  fetchAvailableModels,
  downloadModel,
  type DaemonModelInfo,
} from '@/lib/tauriBridge';
import { VideoBgRemoverJob } from '@/lib/videoBgRemover';

import { useStudioState } from '@/composables/useStudioState';
const bgRemoverDir = shallowRef<string>(STUDIO_BG_REMOVER_DIR);
const { selectedBgModel: selectedBgModel } = useStudioState();
const isDragging = shallowRef(false);
const defaultFormat = shallowRef<'prores_4444' | 'webm_alpha' | 'luma_matte'>('webm_alpha');
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef');

const jobs = ref<BatchMattingJob[]>([
  {
    id: 'job_sample_1',
    fileName: 'podcast_camera_angle_raw.mp4',
    filePath: `${STUDIO_BG_REMOVER_DIR}/podcast_camera_angle_raw.mp4`,
    fileSizeBytes: 64200000,
    status: 'completed',
    progressPct: 100,
    fps: 34,
    etaSeconds: 0,
    outputFormat: 'prores_4444',
    outputPath: `${STUDIO_BG_REMOVER_DIR}/podcast_camera_angle_transparent.mov`,
  },
]);

onMounted(async () => {
  const dir = await getDefaultBgRemoverDirectory();
  if (dir) {
    bgRemoverDir.value = dir;
    if (jobs.value[0]) {
      jobs.value[0].filePath = `${dir}/podcast_camera_angle_raw.mp4`;
      jobs.value[0].outputPath = `${dir}/podcast_camera_angle_transparent.mov`;
    }
  }
});

interface BgModelOption {
  id: BgModelType;
  name: string;
  fileName: string;
  badge: string;
  badgeColor: string;
  size: string;
  latency: string;
  description: string;
}

const BG_MODEL_OPTIONS: BgModelOption[] = [
  {
    id: 'mediapipe_fast',
    name: 'MediaPipe Selfie',
    fileName: 'selfie_segmentation.onnx',
    badge: 'Ultra-Fast',
    badgeColor: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
    size: '0.45 MB',
    latency: '<25ms',
    description: 'Ultra-low latency neural matting running via Tract SIMD on local CPU. Recommended for 30+ FPS live preview.',
  },
  {
    id: 'rvm_video',
    name: 'Robust Video Matting',
    fileName: 'rvm_mobilenetv3.onnx',
    badge: 'Temporal Sync',
    badgeColor: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30',
    size: '15.2 MB',
    latency: '~45ms',
    description: 'Recurrent video matting with temporal memory to eliminate flickering and stabilize boundary silhouettes.',
  },
  {
    id: 'rmbg_1_4',
    name: 'RMBG-1.4 Studio',
    fileName: 'rmbg_1_4.onnx',
    badge: 'Hair-Level HQ',
    badgeColor: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
    size: '176 MB',
    latency: '~110ms',
    description: 'Fine edge refinement model preserving individual hair strands and semi-transparent clothing borders.',
  },
  {
    id: 'birefnet_hq',
    name: 'BiRefNet Ultra',
    fileName: 'birefnet_general.onnx',
    badge: 'Cinema Quality',
    badgeColor: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
    size: '224 MB',
    latency: '~140ms',
    description: 'Bilateral reference network for cinema-grade edge detail in offline batch extraction and studio recording.',
  },
];

const currentModel = computed(() => {
  return BG_MODEL_OPTIONS.find((m) => m.id === selectedBgModel.value) || BG_MODEL_OPTIONS[0];
});

const daemonModels = shallowRef<DaemonModelInfo[]>([]);

const isCurrentModelDownloaded = computed(() => {
  const dm = daemonModels.value.find((m) => m.file_name === currentModel.value.fileName);
  if (currentModel.value.id === 'mediapipe_fast') return true;
  return Boolean(dm?.is_downloaded);
});

const isDownloading = shallowRef(false);
const downloadError = shallowRef<string | null>(null);

async function handleDownloadModel() {
  if (isDownloading.value || isCurrentModelDownloaded.value) return;
  isDownloading.value = true;
  downloadError.value = null;
  try {
    const res = await downloadModel(currentModel.value.fileName);
    if (res.success) {
      daemonModels.value = await fetchAvailableModels();
    } else {
      downloadError.value = res.error || 'Failed to download model';
    }
  } catch (err: any) {
    downloadError.value = err?.message || 'Download network error';
  } finally {
    isDownloading.value = false;
  }
}
onMounted(async () => {
  daemonModels.value = await fetchAvailableModels();
  const dir = await getDefaultBgRemoverDirectory();
  if (dir) {
    bgRemoverDir.value = dir;
    if (jobs.value[0]) {
      jobs.value[0].filePath = `${dir}/podcast_camera_angle_raw.mp4`;
      jobs.value[0].outputPath = `${dir}/podcast_camera_angle_transparent.mov`;
    }
  }
});

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}

function handleDragLeave() {
  isDragging.value = false;
}

async function triggerFileInput() {
  const nativeFiles = await selectVideoFiles();
  if (nativeFiles && nativeFiles.length > 0) {
    await enqueueFilePaths(nativeFiles);
    return;
  }
  fileInputRef.value?.click();
}

const activeRemoverJobs = new Map<string, VideoBgRemoverJob>();

async function enqueueFilePaths(paths: string[]) {
  const targetDir = bgRemoverDir.value || (await getDefaultBgRemoverDirectory());
  for (const filePath of paths) {
    const fileName = filePath.split(/[/\\]/).pop() || 'video.mp4';
    const ext = defaultFormat.value === 'prores_4444' ? 'mov' : (defaultFormat.value === 'webm_alpha' ? 'webm' : 'mp4');
    const stem = fileName.replace(/\.[^/.]+$/, '');
    const outputPath = `${targetDir}/${stem}_alpha.${ext}`;

    const newJob: BatchMattingJob = {
      id: `job_${Date.now()}_${Math.random()}`,
      fileName,
      filePath,
      fileSizeBytes: 0,
      status: 'queued',
      progressPct: 0,
      fps: 0,
      etaSeconds: 0,
      outputFormat: defaultFormat.value,
      outputPath,
    };
    jobs.value.unshift(newJob);
    executeExtraction(newJob, filePath, targetDir);
  }
}

async function enqueueFiles(files: File[]) {
  const targetDir = bgRemoverDir.value || (await getDefaultBgRemoverDirectory());
  for (const file of files) {
    const filePath = (await getFilePathForFile(file)) || file.name;
    const ext = defaultFormat.value === 'prores_4444' ? 'mov' : (defaultFormat.value === 'webm_alpha' ? 'webm' : 'mp4');
    const stem = file.name.replace(/\.[^/.]+$/, '');
    const outputPath = `${targetDir}/${stem}_alpha.${ext}`;

    const newJob: BatchMattingJob = {
      id: `job_${Date.now()}_${Math.random()}`,
      fileName: file.name,
      filePath,
      fileSizeBytes: file.size,
      status: 'queued',
      progressPct: 0,
      fps: 0,
      etaSeconds: 0,
      outputFormat: defaultFormat.value,
      outputPath,
    };
    jobs.value.unshift(newJob);

    executeExtraction(newJob, file, targetDir);
  }
}

async function executeExtraction(job: BatchMattingJob, fileOrPath: File | string, targetDir: string) {
  // If the model selected is not downloaded yet, ensure it gets downloaded
  if (currentModel.value.id !== 'mediapipe_fast' && !isCurrentModelDownloaded.value) {
    job.status = 'loading_model';
    job.errorMessage = undefined;
    try {
      const res = await downloadModel(currentModel.value.fileName);
      if (res.success) {
        daemonModels.value = await fetchAvailableModels();
      } else {
        job.status = 'failed';
        job.errorMessage = res.error || 'Failed to download selected AI model';
        return;
      }
    } catch (e: any) {
      job.status = 'failed';
      job.errorMessage = e?.message || 'Model download error';
      return;
    }
  }

  // Obtain a File or Blob or URL for the video
  let source: File | Blob | string = fileOrPath;
  if (typeof fileOrPath === 'string') {
    const buf = await readFileBuffer(fileOrPath);
    if (buf) {
      source = new Blob([buf], { type: 'video/mp4' });
    }
  }

  const stem = job.fileName.replace(/\.[^/.]+$/, '');
  const removerJob = new VideoBgRemoverJob({
    id: job.id,
    source,
    fileName: job.fileName,
    fileStem: stem,
    modelId: selectedBgModel.value,
    modelFileName: currentModel.value.fileName,
    outputFormat: job.outputFormat || defaultFormat.value,
    targetDir,
    onProgress: (p) => {
      job.progressPct = p.pct;
      job.fps = p.fps;
      job.etaSeconds = p.etaSeconds;
      job.processedFrames = p.frame;
      job.totalFrames = p.totalFrames;
    },
    onPreview: (thumb) => {
      job.previewThumbnail = thumb;
    },
    onStatusChange: (status, errMsg) => {
      job.status = status;
      if (errMsg) job.errorMessage = errMsg;
    },
  });

  activeRemoverJobs.set(job.id, removerJob);

  const res = await removerJob.run();
  activeRemoverJobs.delete(job.id);

  if (res.success && res.outputPath) {
    job.status = 'completed';
    job.progressPct = 100;
    job.outputPath = res.outputPath;
  } else if (!job.errorMessage) {
    job.status = 'failed';
    job.errorMessage = res.error || 'Video background extraction failed';
  }
}

function cancelJob(jobId: string) {
  const active = activeRemoverJobs.get(jobId);
  if (active) {
    active.cancel();
    activeRemoverJobs.delete(jobId);
  }
  const j = jobs.value.find((x) => x.id === jobId);
  if (j && (j.status === 'processing' || j.status === 'loading_model' || j.status === 'queued' || j.status === 'finalizing')) {
    j.status = 'failed';
    j.errorMessage = 'Cancelled by user';
  }
}

async function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  if (!e.dataTransfer?.files) return;
  await enqueueFiles(Array.from(e.dataTransfer.files));
}

async function handleFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    await enqueueFiles(Array.from(input.files));
  }
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

async function revealOutput(job: BatchMattingJob) {
  const target = job.outputPath || job.filePath;
  const res = await revealInFolder(target);
  if (!res.success) {
    navigator.clipboard?.writeText(target).catch(() => { });
    window.alert(`Transparent video output path (copied to clipboard):\n${target}`);
  }
}

async function handleOpenBgRemoverFolder() {
  const dir = bgRemoverDir.value || (await getDefaultBgRemoverDirectory());
  const res = await openExportDirectory(dir);
  if (!res.success) {
    navigator.clipboard?.writeText(dir).catch(() => { });
    window.alert(`AI BG Remover folder path (copied to clipboard):\n${dir}`);
  }
}
</script>

<template>
  <main class="flex-1 overflow-y-auto p-6 md:p-8 z-20">
    <div class="max-w-5xl mx-auto">
      <div class="space-y-6 font-sans">
        <!-- Top Configuration Header -->
        <div
          class="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl glass-card border border-white/[0.08] shadow-xl">
          <div class="flex items-center space-x-3.5">
            <div
              class="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-400/20 text-indigo-400 shadow-[0_0_16px_rgba(99,102,241,0.25)]">
              <Sparkles class="w-5 h-5" />
            </div>
            <div>
              <h3 class="text-sm font-semibold text-white tracking-wide">AI Background Matting & Export Suite</h3>
              <p class="text-xs text-gray-400 font-mono mt-0.5">Extract subjects with hair-level precision • Output
                stored in [videos path]/studio/bg-remover</p>
            </div>
          </div>

          <div class="flex items-center space-x-3">
            <!-- Open Output Folder Action -->
            <button type="button" @click="handleOpenBgRemoverFolder"
              class="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-gray-200 border border-white/10 text-xs font-medium transition-all"
              title="Open bg-remover destination folder">
              <FolderOpen class="w-3.5 h-3.5 text-indigo-400" />
              <span>Open Folder</span>
            </button>

          </div>
        </div>
        <!-- Drag & Drop Zone -->
        <div @click="triggerFileInput" @dragover="handleDragOver" @dragleave="handleDragLeave" @drop="handleDrop"
          class="border-2 border-dashed rounded-3xl p-10 text-center transition-all cursor-pointer relative overflow-hidden group"
          :class="[
            isDragging
              ? 'border-indigo-400 bg-indigo-500/10 scale-[1.01] shadow-[0_0_32px_rgba(99,102,241,0.3)]'
              : 'border-white/10 hover:border-white/25 bg-[#10121A]/80 hover:bg-[#141722]/80'
          ]">
          <input ref="fileInputRef" type="file" accept="video/*" multiple class="hidden"
            @change="handleFileInputChange" />
          <div
            class="w-16 h-16 rounded-2xl bg-indigo-500/15 border border-indigo-400/20 text-indigo-400 flex items-center justify-center mx-auto mb-4 shadow-[0_0_24px_rgba(99,102,241,0.2)] group-hover:scale-110 transition-transform">
            <UploadCloud class="w-8 h-8" />
          </div>
          <h4 class="text-base font-semibold text-white tracking-wide mb-1.5">
            Click or drag & drop any video file to remove background
          </h4>
          <p class="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
            Supports MP4, MOV, MKV, and WebM. Automatically segments subjects locally and exports clean transparent
            video directly compatible with DaVinci Resolve, Premiere Pro, and Final Cut.
          </p>
        </div>

        <!-- AI Background Removal Model & Format Settings -->
        <div class="p-6 rounded-2xl glass-card border border-white/[0.08] shadow-xl space-y-5">
          <!-- Card Header -->
          <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
            <div class="flex items-center gap-2.5">
              <div class="p-2 rounded-xl bg-indigo-500/15 border border-indigo-400/25 text-indigo-400">
                <Cpu class="w-4 h-4" />
              </div>
              <div>
                <h4 class="text-sm font-semibold text-white tracking-wide">AI Inference Model & Export Preset</h4>
                <p class="text-[11px] text-white/50">Select GPU neural matting architecture and target editor format</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-mono text-indigo-300">
                <Sparkles class="w-3 h-3 text-indigo-400" />
                <span>WebGL / WebGPU Shaders</span>
              </span>
            </div>
          </div>

          <!-- 2-Column Responsive Layout -->
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <!-- Left Column: Model Selection & Spec Card (7 cols) -->
            <div class="lg:col-span-7 space-y-3.5">
              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  <span>Matting Architecture</span>
                </label>
                <span class="text-[10px] font-mono text-gray-500">Local Neural Network</span>
              </div>

              <!-- Styled Model Selector -->
              <div class="relative">
                <select v-model="selectedBgModel"
                  class="w-full appearance-none bg-black/40 hover:bg-black/60 border border-white/10 hover:border-white/20 focus:border-indigo-400/60 rounded-xl px-4 py-2.5 pr-10 text-xs text-white font-medium transition cursor-pointer outline-none">
                  <option v-for="model in BG_MODEL_OPTIONS" :key="model.id" :value="model.id"
                    class="bg-[#12141d] text-white">
                    {{ model.name }} ({{ model.badge }} • {{ model.size }})
                  </option>
                </select>
                <ChevronDown
                  class="w-4 h-4 text-white/40 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <!-- Model Spec & Status Card -->
              <div class="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2.5">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span :class="['text-[10px] font-semibold px-2 py-0.5 rounded-md border', currentModel.badgeColor]">
                      {{ currentModel.badge }}
                    </span>
                    <span class="text-xs font-semibold text-white">{{ currentModel.name }}</span>
                  </div>

                  <div class="flex items-center gap-2 text-[11px] font-mono">
                    <span class="flex items-center gap-1 text-amber-300">
                      <Zap class="w-3 h-3" />
                      {{ currentModel.latency }}
                    </span>
                    <span class="text-white/20">•</span>
                    <span class="text-white/50">{{ currentModel.size }}</span>
                  </div>
                </div>

                <p class="text-xs text-white/60 leading-relaxed">
                  {{ currentModel.description }}
                </p>

                <div
                  class="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-white/50">
                  <div class="flex items-center gap-2">
                    <span :class="[
                      'w-2 h-2 rounded-full',
                      isCurrentModelDownloaded ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-amber-400'
                    ]" />
                    <span class="text-white/70">{{ isCurrentModelDownloaded ? 'Cached locally on disk' : 'Auto-downloads on demand' }}</span>
                  </div>
                  <span class="text-white/30">FP32 Tensor</span>
                </div>
              </div>

              <!-- Download Action Button / Ready Indicator -->
              <div>
                <div v-if="isCurrentModelDownloaded"
                  class="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-medium">
                  <div class="flex items-center gap-2">
                    <CheckCircle2 class="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Model cached & ready for local extraction</span>
                  </div>
                  <span
                    class="text-[10px] font-mono uppercase bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300 border border-emerald-500/30">Ready</span>
                </div>

                <div v-else class="space-y-1.5">
                  <button type="button" @click="handleDownloadModel" :disabled="isDownloading"
                    class="w-full py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition shadow-lg shadow-indigo-500/20 cursor-pointer disabled:cursor-not-allowed">
                    <Loader2 v-if="isDownloading" class="w-4 h-4 animate-spin text-white" />
                    <Download v-else class="w-4 h-4 text-white" />
                    <span>{{ isDownloading ? `Downloading ${currentModel.name} (${currentModel.size})...` :
                      `Download ${currentModel.name} (${currentModel.size})` }}</span>
                  </button>
                  <p v-if="downloadError" class="text-[11px] text-rose-400 flex items-center gap-1.5">
                    <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                    <span>{{ downloadError }}</span>
                  </p>
                </div>
              </div>
            </div>

            <!-- Right Column: Format Preset Selector (5 cols) -->
            <div class="lg:col-span-5 space-y-3.5">
              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  <Layers class="w-3.5 h-3.5 text-indigo-400" />
                  <span>Output Format Preset</span>
                </label>
                <span class="text-[10px] font-mono text-gray-500">FFmpeg Master</span>
              </div>

              <!-- Format Preset Options -->
              <div class="space-y-2.5">
                <!-- WebM VP9 Alpha -->
                <div @click="defaultFormat = 'webm_alpha'"
                  :class="[
                    'p-3.5 rounded-xl border transition cursor-pointer flex items-start gap-3',
                    defaultFormat === 'webm_alpha'
                      ? 'bg-indigo-500/15 border-indigo-400/40 shadow-[0_0_16px_rgba(99,102,241,0.15)]'
                      : 'bg-black/30 border-white/5 hover:border-white/15'
                  ]">
                  <div :class="[
                    'w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 transition-colors',
                    defaultFormat === 'webm_alpha' ? 'border-indigo-400 bg-indigo-500' : 'border-white/30'
                  ]">
                    <div v-if="defaultFormat === 'webm_alpha'" class="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-semibold text-white">WebM VP9 Alpha</span>
                      <span class="text-[10px] font-mono text-indigo-300">.webm</span>
                    </div>
                    <p class="text-[11px] text-white/50 leading-tight mt-1">
                      Native transparent web video. Ultra-lightweight file size with full 8-bit alpha cutout.
                    </p>
                  </div>
                </div>

                <!-- Apple ProRes 4444 -->
                <div @click="defaultFormat = 'prores_4444'"
                  :class="[
                    'p-3.5 rounded-xl border transition cursor-pointer flex items-start gap-3',
                    defaultFormat === 'prores_4444'
                      ? 'bg-indigo-500/15 border-indigo-400/40 shadow-[0_0_16px_rgba(99,102,241,0.15)]'
                      : 'bg-black/30 border-white/5 hover:border-white/15'
                  ]">
                  <div :class="[
                    'w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 transition-colors',
                    defaultFormat === 'prores_4444' ? 'border-indigo-400 bg-indigo-500' : 'border-white/30'
                  ]">
                    <div v-if="defaultFormat === 'prores_4444'" class="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-semibold text-white">Apple ProRes 4444</span>
                      <span class="text-[10px] font-mono text-indigo-300">.mov</span>
                    </div>
                    <p class="text-[11px] text-white/50 leading-tight mt-1">
                      10-bit cinema master with transparency. Supported natively in DaVinci Resolve, Premiere, and FCP.
                    </p>
                  </div>
                </div>

                <!-- High-Contrast Luma Matte -->
                <div @click="defaultFormat = 'luma_matte'"
                  :class="[
                    'p-3.5 rounded-xl border transition cursor-pointer flex items-start gap-3',
                    defaultFormat === 'luma_matte'
                      ? 'bg-indigo-500/15 border-indigo-400/40 shadow-[0_0_16px_rgba(99,102,241,0.15)]'
                      : 'bg-black/30 border-white/5 hover:border-white/15'
                  ]">
                  <div :class="[
                    'w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 transition-colors',
                    defaultFormat === 'luma_matte' ? 'border-indigo-400 bg-indigo-500' : 'border-white/30'
                  ]">
                    <div v-if="defaultFormat === 'luma_matte'" class="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-semibold text-white">High-Contrast Luma Matte</span>
                      <span class="text-[10px] font-mono text-indigo-300">.mp4</span>
                    </div>
                    <p class="text-[11px] text-white/50 leading-tight mt-1">
                      High-contrast black & white mask track video. Universal compatibility across all video editors.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- Batch Extraction Queue -->
        <div class="space-y-3.5">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Extraction Queue ({{ jobs.length }})
            </h4>
            <span class="text-xs font-mono text-gray-500">100% Local GPU/CPU Inference</span>
          </div>

          <div v-for="job in jobs" :key="job.id"
            class="p-4 rounded-2xl glass-card flex items-center justify-between gap-4 border border-white/[0.06] transition-all hover:border-white/15">
            <div class="flex items-center space-x-3.5 min-w-0">
              <div v-if="job.previewThumbnail"
                class="w-16 h-11 rounded-xl overflow-hidden border border-white/10 shrink-0 bg-black/40 shadow-inner">
                <img :src="job.previewThumbnail" alt="Preview" class="w-full h-full object-cover" />
              </div>
              <div v-else
                class="p-3 rounded-xl bg-white/[0.06] text-gray-300 border border-white/5 shadow-inner shrink-0">
                <Film class="w-5 h-5 text-indigo-400" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center space-x-2.5">
                  <span class="text-sm font-semibold text-white tracking-wide truncate max-w-sm">
                    {{ job.fileName }}
                  </span>
                  <span
                    class="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-white/10 text-gray-300 border border-white/5 uppercase">
                    {{ job.outputFormat.replace('_', ' ') }}
                  </span>
                </div>
                <div class="flex items-center space-x-3 text-xs text-gray-400 font-mono mt-1">
                  <span v-if="job.fileSizeBytes > 0">{{ formatBytes(job.fileSizeBytes) }}</span>
                  <template v-if="job.status === 'loading_model'">
                    <span>•</span>
                    <span class="text-amber-400 font-semibold flex items-center space-x-1">
                      <Loader2 class="w-3 h-3 animate-spin" />
                      <span>Loading AI Model...</span>
                    </span>
                  </template>
                  <template v-if="job.status === 'processing'">
                    <span>•</span>
                    <span class="text-indigo-400 font-semibold flex items-center space-x-1.5">
                      <Loader2 class="w-3 h-3 animate-spin shrink-0" />
                      <span>{{ job.fps > 0 ? `${job.fps} FPS` : 'Segmenting' }}</span>
                      <span v-if="job.etaSeconds > 0">• ETA {{ job.etaSeconds }}s</span>
                      <span v-if="job.totalFrames" class="text-white/40">({{ job.processedFrames || 0 }}/{{
                        job.totalFrames }} frames)</span>
                    </span>
                  </template>
                  <template v-if="job.status === 'finalizing'">
                    <span>•</span>
                    <span class="text-indigo-300 font-semibold flex items-center space-x-1">
                      <Loader2 class="w-3 h-3 animate-spin" />
                      <span>Finalizing with FFmpeg...</span>
                    </span>
                  </template>
                  <template v-if="job.status === 'completed'">
                    <span>•</span>
                    <span class="text-emerald-400 flex items-center space-x-1.5 font-sans font-medium">
                      <CheckCircle2 class="w-3.5 h-3.5" />
                      <span>Ready for Video Editor</span>
                    </span>
                  </template>
                  <template v-if="job.status === 'failed'">
                    <span>•</span>
                    <span class="text-rose-400 flex items-center space-x-1.5 font-sans font-medium"
                      :title="job.errorMessage">
                      <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                      <span class="truncate max-w-xs">{{ job.errorMessage || 'Extraction failed' }}</span>
                    </span>
                  </template>
                </div>
              </div>
            </div>

            <div class="flex items-center space-x-4">
              <div v-if="job.status === 'processing' || job.status === 'loading_model' || job.status === 'finalizing'"
                class="w-36">
                <div class="flex justify-between text-[11px] font-mono text-gray-300 mb-1.5">
                  <span>{{ job.status === 'loading_model' ? 'Model' : (job.status === 'finalizing' ? 'Finalizing' :
                    'Extracting')
                    }}</span>
                  <span class="font-semibold text-indigo-400">{{ job.progressPct }}%</span>
                </div>
                <div class="w-full h-2 bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/5">
                  <div
                    class="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(99,102,241,0.6)]"
                    :style="{ width: `${job.progressPct}%` }" />
                </div>
              </div>

              <button
                v-if="job.status === 'processing' || job.status === 'loading_model' || job.status === 'finalizing'"
                @click="cancelJob(job.id)"
                class="flex items-center space-x-1 px-3 py-1.5 bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 rounded-xl text-xs font-mono transition-all">
                <XCircle class="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>

              <button v-if="job.status === 'failed'" @click="executeExtraction(job, job.filePath, bgRemoverDir)"
                class="flex items-center space-x-1 px-3 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-semibold transition-all active:scale-95 shadow-sm">
                <RotateCcw class="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>

              <button v-if="job.status === 'completed'" @click="revealOutput(job)"
                class="flex items-center space-x-2 px-4 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold transition-all active:scale-95 shadow-sm">
                <Download class="w-3.5 h-3.5" />
                <span>Reveal Transparent File</span>
              </button>

              <button @click="removeJob(job.id)"
                class="p-2 text-gray-500 hover:text-red-400 rounded-xl hover:bg-white/[0.06] transition-colors"
                title="Remove from queue">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
