<script setup lang="ts">import { ref, shallowRef, onMounted, useTemplateRef } from 'vue';
import {
  UploadCloud,
  Sparkles,
  CheckCircle2,
  Trash2,
  Layers,
  Cpu,
  Download,
  Film,
  FolderOpen,
  AlertCircle,
  RotateCcw,
  Loader2,
} from 'lucide-vue-next';
import type { BatchMattingJob } from '@/types/studio';
import {
  STUDIO_BG_REMOVER_DIR,
  getDefaultBgRemoverDirectory,
  invokeCommand,
  openExportDirectory,
  revealInFolder,
  selectVideoFiles,
  getFilePathForFile,
} from '@/lib/tauriBridge';

import { useStudioState } from '@/composables/useStudioState';

const bgRemoverDir = shallowRef<string>(STUDIO_BG_REMOVER_DIR);
const { selectedBgModel: selectedModel } = useStudioState();

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

const isDragging = shallowRef(false);
const defaultFormat = shallowRef<'prores_4444' | 'webm_alpha' | 'luma_matte'>('webm_alpha');
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef');

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
      etaSeconds: 15,
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
    const filePath = await getFilePathForFile(file);
    const ext = defaultFormat.value === 'prores_4444' ? 'mov' : (defaultFormat.value === 'webm_alpha' ? 'webm' : 'mp4');
    const stem = file.name.replace(/\.[^/.]+$/, '');
    const outputPath = `${targetDir}/${stem}_alpha.${ext}`;

    const newJob: BatchMattingJob = {
      id: `job_${Date.now()}_${Math.random()}`,
      fileName: file.name,
      filePath: filePath || file.name,
      fileSizeBytes: file.size,
      status: 'queued',
      progressPct: 0,
      fps: 0,
      etaSeconds: 15,
      outputFormat: defaultFormat.value,
      outputPath,
    };
    jobs.value.unshift(newJob);

    if (!filePath) {
      newJob.status = 'failed';
      newJob.errorMessage = 'Could not access file path on disk. Please click to use the native file selector.';
      continue;
    }

    executeExtraction(newJob, filePath, targetDir);
  }
}

async function executeExtraction(job: BatchMattingJob, inputPath: string, targetDir: string) {
  job.status = 'processing';
  job.progressPct = 15;
  job.fps = 30;
  job.errorMessage = undefined;

  let currentPct = 15;
  const progressTimer = setInterval(() => {
    if (currentPct < 90) {
      currentPct += 5;
      job.progressPct = currentPct;
    }
  }, 400);

  try {
    const res = await invokeCommand<{ success: boolean; output_path?: string; error?: string }>(
      'extract_transparent_background',
      {
        file_path: inputPath,
        format: job.outputFormat || defaultFormat.value,
        model: selectedModel.value,
        output_dir: targetDir,
      }
    );

    clearInterval(progressTimer);

    if (res && res.success && res.output_path) {
      job.status = 'completed';
      job.progressPct = 100;
      job.outputPath = res.output_path;
    } else {
      job.status = 'failed';
      job.errorMessage = res?.error || 'Extraction failed in daemon';
    }
  } catch (err: any) {
    clearInterval(progressTimer);
    job.status = 'failed';
    job.errorMessage = err?.message || 'Daemon offline or extraction failed';
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

            <!-- Neural Model Selector -->
            <div class="relative">
              <select v-model="selectedModel"
                class="appearance-none bg-[#12141D] border border-white/10 text-gray-200 text-xs rounded-xl px-3 py-1.5 pr-8 focus:outline-none focus:border-indigo-400 font-medium">
                <option value="birefnet_hq" class="bg-[#12141D]">Ultra Quality: BiRefNet</option>
                <option value="rmbg_1_4" class="bg-[#12141D]">HQ Portrait: RMBG-1.4</option>
                <option value="rvm_video" class="bg-[#12141D]">Smooth Motion: RVM</option>
                <option value="mediapipe_fast" class="bg-[#12141D]">Fast Realtime: MediaPipe</option>
              </select>
              <Cpu class="w-3.5 h-3.5 text-indigo-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>

            <!-- Format Preset -->
            <div class="relative">
              <select v-model="defaultFormat"
                class="appearance-none bg-[#12141D] border border-white/10 text-gray-200 text-xs rounded-xl px-3 py-1.5 pr-8 focus:outline-none focus:border-indigo-400 font-medium">
                <option value="webm_alpha" class="bg-[#12141D]">WebM VP9 Alpha (.webm)</option>
                <option value="prores_4444" class="bg-[#12141D]">Apple ProRes 4444 (.mov)</option>
                <option value="luma_matte" class="bg-[#12141D]">High-Contrast Luma Matte (.mp4)</option>
              </select>
              <Layers class="w-3.5 h-3.5 text-emerald-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
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
              <div class="p-3 rounded-xl bg-white/[0.06] text-gray-300 border border-white/5 shadow-inner">
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
                  <template v-if="job.status === 'processing'">
                    <span>•</span>
                    <span class="text-indigo-400 font-semibold flex items-center space-x-1">
                      <Loader2 class="w-3 h-3 animate-spin" />
                      <span>Extracting...</span>
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
              <div v-if="job.status === 'processing'" class="w-36">
                <div class="flex justify-between text-[11px] font-mono text-gray-300 mb-1.5">
                  <span>Extracting</span>
                  <span class="font-semibold text-indigo-400">{{ job.progressPct }}%</span>
                </div>
                <div class="w-full h-2 bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/5">
                  <div
                    class="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(99,102,241,0.6)]"
                    :style="{ width: `${job.progressPct}%` }" />
                </div>
              </div>

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
