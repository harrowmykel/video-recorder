<script setup lang="ts">
import { ref, computed, shallowRef, onMounted } from 'vue';
import {
    ChevronDown,
    Zap,
    Sparkles,
    CheckCircle2,
    Layers,
    Cpu,
    Download,
    AlertCircle,
    Loader2,
} from 'lucide-vue-next';
import type { BatchMattingJob, BgModelType } from '@/types/studio';
import {
    STUDIO_BG_REMOVER_DIR,
    getDefaultBgRemoverDirectory,
    fetchAvailableModels,
    downloadModel,
    type DaemonModelInfo,
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

const defaultFormat = shallowRef<'prores_4444' | 'webm_alpha' | 'luma_matte'>('webm_alpha');

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
    return BG_MODEL_OPTIONS.find((m) => m.id === selectedModel.value) || BG_MODEL_OPTIONS[0];
});

const daemonModels = shallowRef<DaemonModelInfo[]>([]);

onMounted(async () => {
    daemonModels.value = await fetchAvailableModels();
});

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
</script>

<template>
    <div
        class="border-1 border rounded-3xl p-10 text-center transition-all cursor-pointer relative overflow-hidden group">
        <div class="flex col-2">

            <!-- AI Background Removal Model Picker -->
            <div class="space-y-2 pt-3 border-t border-white/10">
                <div class="flex items-center justify-between">
                    <label class="text-[10px] font-mono uppercase text-white/50 flex items-center gap-1.5">
                        <Cpu class="w-3.5 h-3.5 text-indigo-400" />
                        <span>In-Browser MediaPipe Model</span>
                    </label>
                    <span class="text-[10px] font-mono text-indigo-400/80 flex items-center gap-1">
                        <Sparkles class="w-3 h-3 text-indigo-400" />
                        <span>WebGL Shaders</span>
                    </span>
                </div>

                <!-- Styled Model Selector -->
                <div class="relative">
                    <select v-model="selectedModel"
                        class="w-full appearance-none bg-white/5 hover:bg-white/10 border border-white/10 focus:border-indigo-400/50 rounded-xl px-3.5 py-2.5 pr-9 text-xs text-white font-medium transition cursor-pointer">
                        <option v-for="model in BG_MODEL_OPTIONS" :key="model.id" :value="model.id"
                            class="bg-[#12141d] text-white">
                            {{ model.name }} ({{ model.badge }} • {{ model.size }})
                        </option>
                    </select>
                    <ChevronDown
                        class="w-4 h-4 text-white/40 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <!-- Model Spec & Status Card -->
                <div class="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span
                                :class="['text-[10px] font-semibold px-2 py-0.5 rounded-lg border', currentModel.badgeColor]">
                                {{ currentModel.badge }}
                            </span>
                            <span class="text-xs font-semibold text-white">{{ currentModel.name }}</span>
                        </div>

                        <div class="flex items-center gap-1.5 text-[11px] font-mono">
                            <span class="flex items-center gap-1 text-amber-300">
                                <Zap class="w-3 h-3" />
                                {{ currentModel.latency }}
                            </span>
                            <span class="text-white/30">•</span>
                            <span class="text-white/50">{{ currentModel.size }}</span>
                        </div>
                    </div>

                    <p class="text-[11px] text-white/55 leading-relaxed">
                        {{ currentModel.description }}
                    </p>

                    <div
                        class="pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px] text-white/50 font-mono">
                        <div class="flex items-center gap-1.5">
                            <span :class="[
                                'w-1.5 h-1.5 rounded-full',
                                isCurrentModelDownloaded ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-amber-400'
                            ]" />
                            <span>{{ isCurrentModelDownloaded ? 'Cached in studio/.cache' : 'Auto-downloads on demand'
                                }}</span>
                        </div>
                        <span class="text-white/30">FP32 Tensor</span>
                    </div>
                </div>

                <!-- Download Action Button / Ready Indicator -->
                <div class="pt-1">
                    <div v-if="isCurrentModelDownloaded"
                        class="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-medium">
                        <div class="flex items-center gap-2">
                            <CheckCircle2 class="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>Model downloaded & ready for real-time matting</span>
                        </div>
                        <span
                            class="text-[10px] font-mono uppercase bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300 border border-emerald-500/30">Ready</span>
                    </div>

                    <div v-else class="space-y-1.5">
                        <button @click="handleDownloadModel" :disabled="isDownloading"
                            class="w-full py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition shadow-lg shadow-indigo-500/20 group cursor-pointer disabled:cursor-not-allowed">
                            <Loader2 v-if="isDownloading" class="w-4 h-4 animate-spin text-white" />
                            <Download v-else class="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
                            <span>{{ isDownloading ? `Downloading ${currentModel.name} (${currentModel.size})...` :
                                `Download
                                ${currentModel.name} (${currentModel.size})` }}</span>
                        </button>
                        <p v-if="downloadError" class="text-[11px] text-rose-400 flex items-center gap-1.5">
                            <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                            <span>{{ downloadError }}</span>
                        </p>
                    </div>
                </div>
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
</template>