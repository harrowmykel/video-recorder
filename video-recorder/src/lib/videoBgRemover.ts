import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import type { BgModelType } from '@/types/studio';
import { finalizeBgVideo, getDaemonModelCacheUrl } from './tauriBridge';

export interface VideoBgRemoverProgress {
  pct: number;
  frame: number;
  totalFrames: number;
  fps: number;
  etaSeconds: number;
}

export interface VideoBgRemoverJobOptions {
  id: string;
  source: File | Blob | string;
  fileName: string;
  fileStem: string;
  modelId: BgModelType;
  modelFileName: string;
  outputFormat: 'prores_4444' | 'webm_alpha' | 'luma_matte';
  targetDir?: string;
  onProgress?: (progress: VideoBgRemoverProgress) => void;
  onPreview?: (previewDataUrl: string) => void;
  onStatusChange?: (
    status: 'queued' | 'loading_model' | 'processing' | 'finalizing' | 'completed' | 'failed',
    errorMessage?: string
  ) => void;
}

// MediaPipe Segmenter Singleton
let sharedSegmenter: ImageSegmenter | null = null;
let segmenterInitPromise: Promise<ImageSegmenter | null> | null = null;

async function getOrInitSegmenter(): Promise<ImageSegmenter | null> {
  if (sharedSegmenter) return sharedSegmenter;
  if (segmenterInitPromise) return segmenterInitPromise;

  segmenterInitPromise = (async () => {
    try {
      const base =
        typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : './';
      const cleanBase = base.endsWith('/') ? base : `${base}/`;
      const localWasmPath = new URL(`${cleanBase}mediapipe-wasm`, window.location.href).href.replace(/\/+$/, '');
      const localModelPath = new URL(`${cleanBase}models/selfie_segmenter.tflite`, window.location.href).href;

      let vision;
      let modelPath = localModelPath;

      try {
        vision = await FilesetResolver.forVisionTasks(localWasmPath);
        const check = await fetch(localModelPath, { method: 'HEAD' });
        if (!check.ok) throw new Error(`Local model status: ${check.status}`);
      } catch (localErr) {
        console.warn('[VideoBgRemover] Local MediaPipe assets unreachable, trying CDN fallback...', localErr);
        vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm');
        modelPath =
          'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
      }

      const segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });

      sharedSegmenter = segmenter;
      return segmenter;
    } catch (err) {
      console.warn('[VideoBgRemover] MediaPipe init failed:', err);
      return null;
    } finally {
      segmenterInitPromise = null;
    }
  })();

  return segmenterInitPromise;
}

export class VideoBgRemoverJob {
  private isCancelled = false;
  private videoEl: HTMLVideoElement | null = null;
  private objectUrl: string | null = null;

  constructor(private options: VideoBgRemoverJobOptions) {}

  public cancel(): void {
    this.isCancelled = true;
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.src = '';
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  public async run(): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    const { options } = this;
    try {
      options.onStatusChange?.('loading_model');

      // 1. Initialize Segmentation Engine
      let segmenter: ImageSegmenter | null = null;
      let onnxSession: any = null;

      if (options.modelId === 'mediapipe_fast') {
        segmenter = await getOrInitSegmenter();
        if (!segmenter) {
          throw new Error('Failed to initialize MediaPipe Selfie Segmenter.');
        }
      } else {
        // Option A: Try to load ONNX model from daemon cache
        try {
          const cacheUrl = await getDaemonModelCacheUrl(options.modelFileName);
          const ort = await import('onnxruntime-web');
          // Prefer WebGL / WebGPU for hardware acceleration
          onnxSession = await ort.InferenceSession.create(cacheUrl, {
            executionProviders: ['webgl', 'wasm'],
            graphOptimizationLevel: 'all',
          });
          console.log(`[VideoBgRemover] ONNX model ${options.modelFileName} loaded successfully.`);
        } catch (onnxErr) {
          console.warn(`[VideoBgRemover] Could not load ONNX model (${options.modelFileName}), falling back to MediaPipe:`, onnxErr);
          segmenter = await getOrInitSegmenter();
          if (!segmenter) {
            throw new Error(`Failed to load ONNX model (${options.modelFileName}) and MediaPipe fallback failed.`);
          }
        }
      }

      if (this.isCancelled) return { success: false, error: 'Cancelled by user' };

      // 2. Prepare Source Video Element
      const video = document.createElement('video');
      this.videoEl = video;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';

      if (typeof options.source === 'string') {
        video.src = options.source;
      } else {
        this.objectUrl = URL.createObjectURL(options.source);
        video.src = this.objectUrl;
      }

      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('Failed to load video file into browser media engine.'));
        };
        const cleanup = () => {
          video.removeEventListener('loadedmetadata', onLoaded);
          video.removeEventListener('error', onError);
        };
        video.addEventListener('loadedmetadata', onLoaded);
        video.addEventListener('error', onError);
      });

      if (this.isCancelled) return { success: false, error: 'Cancelled by user' };

      const duration = Math.max(0.1, video.duration || 1);
      const videoW = video.videoWidth || 1280;
      const videoH = video.videoHeight || 720;
      const targetFps = 30;
      const totalFrames = Math.max(1, Math.round(duration * targetFps));

      // 3. Prepare Offscreen Processing Canvases
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = videoW;
      srcCanvas.height = videoH;
      const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
      if (!srcCtx) throw new Error('Could not create source canvas 2D context');

      const maskCanvas = document.createElement('canvas');
      const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
      if (!maskCtx) throw new Error('Could not create mask canvas 2D context');

      // Transparent cutout compositing canvas
      const compCanvas = document.createElement('canvas');
      compCanvas.width = videoW;
      compCanvas.height = videoH;
      const compCtx = compCanvas.getContext('2d');
      if (!compCtx) throw new Error('Could not create compositing canvas 2D context');

      // Live downscaled thumbnail preview canvas
      const previewCanvas = document.createElement('canvas');
      const previewAspect = videoW / videoH;
      previewCanvas.width = 320;
      previewCanvas.height = Math.round(320 / previewAspect);
      const previewCtx = previewCanvas.getContext('2d');

      // 4. Setup MediaRecorder for VP9 Alpha capture
      const stream = compCanvas.captureStream(targetFps);
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      } catch {
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      }

      const recordedChunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      mediaRecorder.start(100);

      options.onStatusChange?.('processing');

      // 5. Deterministic Seek & Process Loop
      let lastFpsTime = performance.now();
      let framesSinceLastFps = 0;
      let currentFps = targetFps;
      let maskImageData: ImageData | null = null;
      let maskData32: Uint32Array | null = null;

      for (let i = 0; i < totalFrames; i++) {
        if (this.isCancelled) {
          mediaRecorder.stop();
          return { success: false, error: 'Cancelled by user' };
        }

        // Seek frame
        const frameTime = i / targetFps;
        await this.seekVideo(video, frameTime);

        // Draw current video frame to source canvas
        srcCtx.drawImage(video, 0, 0, videoW, videoH);

        // Compute AI Mask
        if (segmenter) {
          const timestamp = Math.floor(frameTime * 1000);
          segmenter.segmentForVideo(video, timestamp, (result) => {
            try {
              const confidenceMask = result.confidenceMasks?.[1] ?? result.confidenceMasks?.[0];
              if (!confidenceMask) return;

              const mw = confidenceMask.width;
              const mh = confidenceMask.height;

              if (maskCanvas.width !== mw || maskCanvas.height !== mh) {
                maskCanvas.width = mw;
                maskCanvas.height = mh;
                maskImageData = maskCtx.createImageData(mw, mh);
                maskData32 = new Uint32Array(maskImageData.data.buffer);
              }

              if (maskImageData && maskData32) {
                const floats = confidenceMask.getAsFloat32Array();
                const total = mw * mh;
                for (let px = 0; px < total; px++) {
                  const alpha = (floats[px] * 255) | 0;
                  // Little-endian 0xAABBGGRR: solid white RGB with alpha from segmentation mask
                  maskData32[px] = (alpha << 24) | 0x00ffffff;
                }
                maskCtx.putImageData(maskImageData, 0, 0);
              }
            } finally {
              result.close?.();
            }
          });
        } else if (onnxSession) {
          // Standard ONNX model inference path
          await this.runOnnxInference(onnxSession, srcCanvas, maskCanvas, maskCtx);
        }

        // Composite frame: draw feathered mask then source-in video RGB
        compCtx.clearRect(0, 0, videoW, videoH);
        compCtx.save();
        compCtx.filter = 'blur(1.5px)';
        compCtx.drawImage(maskCanvas, 0, 0, videoW, videoH);
        compCtx.filter = 'none';
        compCtx.globalCompositeOperation = 'source-in';
        compCtx.drawImage(srcCanvas, 0, 0, videoW, videoH);
        compCtx.restore();

        // Emit live preview thumbnail every 3 frames
        if (i % 3 === 0 && previewCtx) {
          previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
          previewCtx.drawImage(compCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
          try {
            const thumb = previewCanvas.toDataURL('image/jpeg', 0.65);
            options.onPreview?.(thumb);
          } catch {}
        }

        // Update real progress & calculated metrics
        framesSinceLastFps++;
        const now = performance.now();
        const delta = now - lastFpsTime;
        if (delta >= 600) {
          currentFps = Math.round((framesSinceLastFps / delta) * 1000);
          framesSinceLastFps = 0;
          lastFpsTime = now;
        }

        const remainingFrames = totalFrames - (i + 1);
        const etaSeconds = Math.max(0, Math.ceil(remainingFrames / Math.max(1, currentFps)));
        const pct = Math.min(99, Math.round(((i + 1) / totalFrames) * 100));

        options.onProgress?.({
          pct,
          frame: i + 1,
          totalFrames,
          fps: currentFps,
          etaSeconds,
        });

        // Yield slightly to keep the UI buttery smooth
        if (i % 5 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      // 6. Stop Recorder and Finalize
      options.onStatusChange?.('finalizing');

      const webmBlob = await new Promise<Blob>((resolve) => {
        mediaRecorder.onstop = () => {
          resolve(new Blob(recordedChunks, { type: 'video/webm' }));
        };
        mediaRecorder.stop();
      });

      // Send to daemon to finalize / transcode with FFmpeg
      const finalizeRes = await finalizeBgVideo({
        blob: webmBlob,
        format: options.outputFormat,
        fileStem: options.fileStem,
        outputDir: options.targetDir,
      });

      if (!finalizeRes.success) {
        throw new Error(finalizeRes.error || 'Failed to finalize transparent video in daemon');
      }

      options.onProgress?.({
        pct: 100,
        frame: totalFrames,
        totalFrames,
        fps: currentFps,
        etaSeconds: 0,
      });

      options.onStatusChange?.('completed');

      return {
        success: true,
        outputPath: finalizeRes.outputPath,
      };
    } catch (err: any) {
      const errorMsg = err?.message || 'Video background extraction failed';
      options.onStatusChange?.('failed', errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      if (this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
      }
    }
  }

  private seekVideo(video: HTMLVideoElement, timeSeconds: number): Promise<void> {
    return new Promise((resolve) => {
      let resolved = false;
      const onSeeked = () => {
        if (!resolved) {
          resolved = true;
          video.removeEventListener('seeked', onSeeked);
          resolve();
        }
      };

      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = Math.min(timeSeconds, video.duration || timeSeconds);

      // Failsafe timeout in case browser drops seeked event
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          video.removeEventListener('seeked', onSeeked);
          resolve();
        }
      }, 300);
    });
  }

  private async runOnnxInference(
    session: any,
    srcCanvas: HTMLCanvasElement,
    maskCanvas: HTMLCanvasElement,
    maskCtx: CanvasRenderingContext2D
  ): Promise<void> {
    try {
      const ort = await import('onnxruntime-web');
      const inputSize = 512;
      const off = document.createElement('canvas');
      off.width = inputSize;
      off.height = inputSize;
      const offCtx = off.getContext('2d')!;
      offCtx.drawImage(srcCanvas, 0, 0, inputSize, inputSize);
      const imgData = offCtx.getImageData(0, 0, inputSize, inputSize);
      const { data } = imgData;

      // Convert RGBA to CHW Float32 tensor normalized [0, 1]
      const floatArr = new Float32Array(3 * inputSize * inputSize);
      const planeSize = inputSize * inputSize;
      for (let p = 0; p < planeSize; p++) {
        floatArr[p] = data[p * 4] / 255.0; // R
        floatArr[planeSize + p] = data[p * 4 + 1] / 255.0; // G
        floatArr[2 * planeSize + p] = data[p * 4 + 2] / 255.0; // B
      }

      const inputName = session.inputNames[0] || 'src';
      const tensor = new ort.Tensor('float32', floatArr, [1, 3, inputSize, inputSize]);
      const feeds: Record<string, any> = {};
      feeds[inputName] = tensor;

      const results = await session.run(feeds);
      const outputName = session.outputNames[0];
      const outputTensor = results[outputName];

      if (outputTensor && outputTensor.data) {
        maskCanvas.width = inputSize;
        maskCanvas.height = inputSize;
        const outImg = maskCtx.createImageData(inputSize, inputSize);
        const outData32 = new Uint32Array(outImg.data.buffer);
        const outFloats = outputTensor.data as Float32Array;

        for (let px = 0; px < planeSize; px++) {
          const val = Math.max(0, Math.min(1, outFloats[px]));
          const alpha = (val * 255) | 0;
          outData32[px] = (alpha << 24) | 0x00ffffff;
        }

        maskCtx.putImageData(outImg, 0, 0);
      }
    } catch (e) {
      console.warn('[runOnnxInference] error:', e);
    }
  }
}
