import { ref, shallowRef, computed, reactive, triggerRef } from 'vue';
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
import { useStudioState } from './useStudioState';

export interface BgModelOption {
  id: BgModelType;
  name: string;
  fileName: string;
  badge: string;
  badgeColor: string;
  size: string;
  latency: string;
  description: string;
}

export const BG_MODEL_OPTIONS: BgModelOption[] = [
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

export interface FormatPresetOption {
  id: 'webm_alpha' | 'prores_4444' | 'luma_matte';
  name: string;
  ext: string;
  description: string;
}

export const FORMAT_PRESET_OPTIONS: FormatPresetOption[] = [
  {
    id: 'webm_alpha',
    name: 'WebM VP9 Alpha',
    ext: '.webm',
    description: 'Native transparent web video. Ultra-lightweight file size with full 8-bit alpha cutout.',
  },
  {
    id: 'prores_4444',
    name: 'Apple ProRes 4444',
    ext: '.mov',
    description: '10-bit cinema master with transparency. Supported natively in DaVinci Resolve, Premiere, and FCP.',
  },
  {
    id: 'luma_matte',
    name: 'High-Contrast Luma Matte',
    ext: '.mp4',
    description: 'High-contrast black & white mask track video. Universal compatibility across all video editors.',
  },
];

export interface StagedVideoFile {
  id: string;
  name: string;
  sizeBytes: number;
  source: File | string;
}

export interface QueuedExtractionItem {
  job: BatchMattingJob;
  source: File | string;
  targetDir: string;
}

const STORAGE_KEY_BATCH_JOBS = 'studio_recorder_batch_jobs_v1';

// Global Singleton State (retained across tab/section navigation and component unmounts)
const bgRemoverDir = shallowRef<string>(STUDIO_BG_REMOVER_DIR);
const defaultFormat = shallowRef<'prores_4444' | 'webm_alpha' | 'luma_matte'>('webm_alpha');
const jobs = ref<BatchMattingJob[]>([]);
const daemonModels = shallowRef<DaemonModelInfo[]>([]);
const isDownloading = shallowRef(false);
const downloadError = shallowRef<string | null>(null);
const stagedFiles = shallowRef<StagedVideoFile[]>([]);
const activeRemoverJobs = new Map<string, VideoBgRemoverJob>();
const extractionQueue = shallowRef<QueuedExtractionItem[]>([]);
let isProcessingQueue = false;
let isInitialized = false;

function loadPersistedJobs(): BatchMattingJob[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BATCH_JOBS);
    if (!raw) {
      // First run sample job
      return [
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
      ];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        ...item,
        status: (item.status === 'processing' || item.status === 'loading_model' || item.status === 'finalizing')
          ? 'failed'
          : item.status,
        errorMessage: (item.status === 'processing' || item.status === 'loading_model' || item.status === 'finalizing')
          ? 'Extraction was interrupted'
          : item.errorMessage,
      }));
    }
  } catch (err) {
    console.warn('[useBatchMatting] Failed to parse saved jobs:', err);
  }
  return [];
}

function savePersistedJobs() {
  if (typeof window === 'undefined') return;
  try {
    const toSave = jobs.value.map((j) => ({
      id: j.id,
      fileName: j.fileName,
      filePath: j.filePath,
      fileSizeBytes: j.fileSizeBytes,
      status: j.status,
      progressPct: j.progressPct,
      fps: j.fps,
      etaSeconds: j.etaSeconds,
      outputFormat: j.outputFormat,
      outputPath: j.outputPath,
      errorMessage: j.errorMessage,
      processedFrames: j.processedFrames,
      totalFrames: j.totalFrames,
      previewThumbnail: j.previewThumbnail && j.previewThumbnail.length < 50000 ? j.previewThumbnail : undefined,
    }));
    localStorage.setItem(STORAGE_KEY_BATCH_JOBS, JSON.stringify(toSave));
  } catch (err) {
    console.warn('[useBatchMatting] Could not persist jobs to localStorage:', err);
  }
}

export function useBatchMatting() {
  const { selectedBgModel } = useStudioState();

  const currentModel = computed(() => {
    return BG_MODEL_OPTIONS.find((m) => m.id === selectedBgModel.value) || BG_MODEL_OPTIONS[0];
  });

  const isCurrentModelDownloaded = computed(() => {
    const dm = daemonModels.value.find((m) => m.file_name === currentModel.value.fileName);
    if (currentModel.value.id === 'mediapipe_fast') return true;
    return Boolean(dm?.is_downloaded);
  });

  async function initBatchMatting() {
    if (isInitialized) return;
    isInitialized = true;

    // Load persisted jobs
    jobs.value = loadPersistedJobs();

    try {
      daemonModels.value = await fetchAvailableModels();
    } catch (e) {
      console.warn('[useBatchMatting] Failed to fetch daemon models:', e);
    }

    try {
      const dir = await getDefaultBgRemoverDirectory();
      if (dir) {
        bgRemoverDir.value = dir;
        const sampleJob = jobs.value.find((j) => j.id === 'job_sample_1');
        if (sampleJob) {
          sampleJob.filePath = `${dir}/podcast_camera_angle_raw.mp4`;
          sampleJob.outputPath = `${dir}/podcast_camera_angle_transparent.mov`;
        }
      }
    } catch (e) {
      console.warn('[useBatchMatting] Failed to fetch default bg remover dir:', e);
    }
  }

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

  async function stageFilePaths(paths: string[]) {
    const newItems: StagedVideoFile[] = [];
    for (const filePath of paths) {
      const name = filePath.split(/[/\\]/).pop() || 'video.mp4';
      newItems.push({
        id: `staged_${Date.now()}_${Math.random()}`,
        name,
        sizeBytes: 0,
        source: filePath,
      });
    }
    stagedFiles.value = [...stagedFiles.value, ...newItems];
  }

  async function stageFiles(files: File[]) {
    const newItems: StagedVideoFile[] = [];
    for (const file of files) {
      newItems.push({
        id: `staged_${Date.now()}_${Math.random()}`,
        name: file.name,
        sizeBytes: file.size,
        source: file,
      });
    }
    stagedFiles.value = [...stagedFiles.value, ...newItems];
  }

  function removeStagedFile(id: string) {
    stagedFiles.value = stagedFiles.value.filter((f) => f.id !== id);
  }

  function clearStagedFiles() {
    stagedFiles.value = [];
  }

  async function triggerFileInput(fallbackRef?: HTMLInputElement | null) {
    const nativeFiles = await selectVideoFiles();
    if (nativeFiles && nativeFiles.length > 0) {
      await stageFilePaths(nativeFiles);
      return;
    }
    fallbackRef?.click();
  }

  async function executeExtraction(job: BatchMattingJob, fileOrPath: File | string, targetDir: string) {
    const reactiveJob = jobs.value.find((j) => j.id === job.id) || job;

    // If the model selected is not downloaded yet, ensure it gets downloaded
    if (currentModel.value.id !== 'mediapipe_fast' && !isCurrentModelDownloaded.value) {
      reactiveJob.status = 'loading_model';
      reactiveJob.errorMessage = undefined;
      triggerRef(jobs);
      try {
        const res = await downloadModel(currentModel.value.fileName);
        if (res.success) {
          daemonModels.value = await fetchAvailableModels();
        } else {
          reactiveJob.status = 'failed';
          reactiveJob.errorMessage = res.error || 'Failed to download selected AI model';
          triggerRef(jobs);
          savePersistedJobs();
          return;
        }
      } catch (e: any) {
        reactiveJob.status = 'failed';
        reactiveJob.errorMessage = e?.message || 'Model download error';
        triggerRef(jobs);
        savePersistedJobs();
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

    const stem = reactiveJob.fileName.replace(/\.[^/.]+$/, '');
    const removerJob = new VideoBgRemoverJob({
      id: reactiveJob.id,
      source,
      fileName: reactiveJob.fileName,
      fileStem: stem,
      modelId: selectedBgModel.value,
      modelFileName: currentModel.value.fileName,
      outputFormat: reactiveJob.outputFormat || defaultFormat.value,
      targetDir,
      onProgress: (p) => {
        reactiveJob.progressPct = p.pct;
        reactiveJob.fps = p.fps;
        reactiveJob.etaSeconds = p.etaSeconds;
        reactiveJob.processedFrames = p.frame;
        reactiveJob.totalFrames = p.totalFrames;
        triggerRef(jobs);
      },
      onPreview: (thumb) => {
        reactiveJob.previewThumbnail = thumb;
        triggerRef(jobs);
      },
      onStatusChange: (status, errMsg) => {
        reactiveJob.status = status;
        if (errMsg) reactiveJob.errorMessage = errMsg;
        triggerRef(jobs);
        savePersistedJobs();
      },
    });

    activeRemoverJobs.set(reactiveJob.id, removerJob);

    const res = await removerJob.run();
    activeRemoverJobs.delete(reactiveJob.id);

    if (res.success && res.outputPath) {
      reactiveJob.status = 'completed';
      reactiveJob.progressPct = 100;
      reactiveJob.outputPath = res.outputPath;
    } else if (!reactiveJob.errorMessage) {
      reactiveJob.status = 'failed';
      reactiveJob.errorMessage = res.error || 'Video background extraction failed';
    }
    triggerRef(jobs);
    savePersistedJobs();
  }

  async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    try {
      while (extractionQueue.value.length > 0) {
        const nextItem = extractionQueue.value[0];
        if (!nextItem) break;

        const currentJob = jobs.value.find((j) => j.id === nextItem.job.id);
        if (!currentJob || currentJob.status === 'failed') {
          extractionQueue.value = extractionQueue.value.slice(1);
          continue;
        }

        await executeExtraction(currentJob, nextItem.source, nextItem.targetDir);

        extractionQueue.value = extractionQueue.value.slice(1);
      }
    } finally {
      isProcessingQueue = false;
    }
  }

  async function startBatchExtraction() {
    if (stagedFiles.value.length === 0) return;
    const items = [...stagedFiles.value];
    stagedFiles.value = [];

    const targetDir = bgRemoverDir.value || (await getDefaultBgRemoverDirectory());

    for (const item of items) {
      const ext = defaultFormat.value === 'prores_4444' ? 'mov' : (defaultFormat.value === 'webm_alpha' ? 'webm' : 'mp4');
      const stem = item.name.replace(/\.[^/.]+$/, '');
      const outputPath = `${targetDir}/${stem}_alpha.${ext}`;

      let filePath = typeof item.source === 'string' ? item.source : item.name;
      if (item.source instanceof File) {
        const nativePath = await getFilePathForFile(item.source);
        if (nativePath) filePath = nativePath;
      }

      const newJob: BatchMattingJob = reactive({
        id: `job_${Date.now()}_${Math.random()}`,
        fileName: item.name,
        filePath,
        fileSizeBytes: item.sizeBytes,
        status: 'queued',
        progressPct: 0,
        fps: 0,
        etaSeconds: 0,
        outputFormat: defaultFormat.value,
        outputPath,
      });

      jobs.value.unshift(newJob);
      const reactiveJob = jobs.value[0];
      extractionQueue.value = [...extractionQueue.value, { job: reactiveJob, source: item.source, targetDir }];
    }

    triggerRef(jobs);
    savePersistedJobs();
    processQueue();
  }

  function cancelJob(jobId: string) {
    extractionQueue.value = extractionQueue.value.filter((item) => item.job.id !== jobId);
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
    triggerRef(jobs);
    savePersistedJobs();
  }

  function retryJob(job: BatchMattingJob) {
    const reactiveJob = jobs.value.find((j) => j.id === job.id) || job;
    reactiveJob.status = 'queued';
    reactiveJob.progressPct = 0;
    reactiveJob.fps = 0;
    reactiveJob.etaSeconds = 0;
    reactiveJob.errorMessage = undefined;
    extractionQueue.value = [...extractionQueue.value, { job: reactiveJob, source: reactiveJob.filePath, targetDir: bgRemoverDir.value }];
    triggerRef(jobs);
    savePersistedJobs();
    processQueue();
  }

  function removeJob(id: string) {
    cancelJob(id);
    jobs.value = jobs.value.filter((j) => j.id !== id);
    savePersistedJobs();
  }

  async function revealOutput(job: BatchMattingJob) {
    const target = job.outputPath || job.filePath;
    const res = await revealInFolder(target);
    if (!res.success) {
      navigator.clipboard?.writeText(target).catch(() => {});
      window.alert(`Transparent video output path (copied to clipboard):\n${target}`);
    }
  }

  async function handleOpenBgRemoverFolder() {
    const dir = bgRemoverDir.value || (await getDefaultBgRemoverDirectory());
    const res = await openExportDirectory(dir);
    if (!res.success) {
      navigator.clipboard?.writeText(dir).catch(() => {});
      window.alert(`AI BG Remover folder path (copied to clipboard):\n${dir}`);
    }
  }

  return {
    jobs,
    stagedFiles,
    extractionQueue,
    defaultFormat,
    bgRemoverDir,
    daemonModels,
    isDownloading,
    downloadError,
    currentModel,
    isCurrentModelDownloaded,
    initBatchMatting,
    handleDownloadModel,
    stageFilePaths,
    stageFiles,
    removeStagedFile,
    clearStagedFiles,
    triggerFileInput,
    startBatchExtraction,
    cancelJob,
    retryJob,
    removeJob,
    revealOutput,
    handleOpenBgRemoverFolder,
    modelOptions: BG_MODEL_OPTIONS,
    formatOptions: FORMAT_PRESET_OPTIONS,
  };
}
