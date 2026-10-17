import { shallowRef, watch, onUnmounted, type Ref } from 'vue';
import type { BgRemovalMode } from '../types/studio';

export interface UseBackgroundSegmentationOptions {
  videoRef: Ref<HTMLVideoElement | null>;
  canvasRef: Ref<HTMLCanvasElement | null>;
  bgMode: Ref<BgRemovalMode>;
  bgImageUrl: Ref<string>;
  bgGradient: Ref<string>;
  isMirrored: Ref<boolean>;
  hasCameraStream: Ref<boolean>;
}

export function useBackgroundSegmentation(options: UseBackgroundSegmentationOptions) {
  const {
    videoRef,
    canvasRef,
    bgMode,
    bgImageUrl,
    bgGradient,
    isMirrored,
    hasCameraStream,
  } = options;

  const isBgImageLoaded = shallowRef(false);
  let loadedBgImage: HTMLImageElement | null = null;
  let animFrameId: number | null = null;

  // Offscreen canvases for real-time foreground segmentation & alpha feathering
  const maskWidth = 160;
  const maskHeight = 120;
  const sampleCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const maskCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const fgCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

  if (sampleCanvas && maskCanvas) {
    sampleCanvas.width = maskWidth;
    sampleCanvas.height = maskHeight;
    maskCanvas.width = maskWidth;
    maskCanvas.height = maskHeight;
  }

  function loadBgImage(url: string) {
    if (!url || typeof Image === 'undefined') {
      isBgImageLoaded.value = false;
      loadedBgImage = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loadedBgImage = img;
      isBgImageLoaded.value = true;
    };
    img.onerror = () => {
      isBgImageLoaded.value = false;
    };
    img.src = url;
  }

  watch(bgImageUrl, (url) => loadBgImage(url), { immediate: true });

  // Compute real-time foreground person alpha matte using border-sampled adaptive chroma/luma distance + portrait spatial prior
  function computeForegroundMask(video: HTMLVideoElement): HTMLCanvasElement | null {
    if (!sampleCanvas || !maskCanvas) return null;
    const sCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    const mCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!sCtx || !mCtx) return null;

    sCtx.drawImage(video, 0, 0, maskWidth, maskHeight);
    const frame = sCtx.getImageData(0, 0, maskWidth, maskHeight);
    const data = frame.data;

    // 1. Sample outer border pixels (top row + upper left/right corners) to estimate ambient background color clusters
    let bgR = 0;
    let bgG = 0;
    let bgB = 0;
    let count = 0;

    for (let x = 0; x < maskWidth; x += 2) {
      const idx = x * 4;
      bgR += data[idx];
      bgG += data[idx + 1];
      bgB += data[idx + 2];
      count++;
    }
    for (let y = 0; y < Math.floor(maskHeight * 0.45); y += 2) {
      const leftIdx = (y * maskWidth + 2) * 4;
      const rightIdx = (y * maskWidth + (maskWidth - 3)) * 4;
      bgR += data[leftIdx] + data[rightIdx];
      bgG += data[leftIdx + 1] + data[rightIdx + 1];
      bgB += data[leftIdx + 2] + data[rightIdx + 2];
      count += 2;
    }

    bgR /= Math.max(1, count);
    bgG /= Math.max(1, count);
    bgB /= Math.max(1, count);

    // 2. Build per-pixel foreground alpha combining color distance from background, skin-tone boost, and portrait silhouette prior
    for (let y = 0; y < maskHeight; y++) {
      const ny = (y / maskHeight - 0.58) / 0.44; // centered on head + shoulders
      for (let x = 0; x < maskWidth; x++) {
        const nx = (x / maskWidth - 0.5) / 0.36;
        // Portrait head-and-shoulders spatial prior
        const shoulderWidthFactor = y > maskHeight * 0.62 ? 1.38 : 1.0;
        const distSq = (nx / shoulderWidthFactor) * (nx / shoulderWidthFactor) + ny * ny;

        const idx = (y * maskWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const dr = r - bgR;
        const dg = g - bgG;
        const db = b - bgB;
        const colorDist = Math.sqrt(dr * dr + dg * dg + db * db);

        // Skin tone likelihood boost (warmth in R > G > B)
        const isWarmSkin = r > 60 && g > 40 && b > 20 && r > g && r > b && r - Math.min(g, b) > 15;
        const skinBoost = isWarmSkin ? 28 : 0;

        // Spatial prior weight
        const spatialPrior = Math.max(0, 1.15 - distSq * 0.85);
        const combinedScore = (colorDist + skinBoost) * 0.65 + spatialPrior * 52;

        let alpha = 0;
        if (distSq < 0.35) {
          alpha = 255;
        } else if (distSq > 1.45) {
          alpha = 0;
        } else {
          alpha = Math.min(255, Math.max(0, Math.round((combinedScore - 34) * 5.2)));
        }

        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = alpha;
      }
    }

    mCtx.putImageData(frame, 0, 0);
    return maskCanvas;
  }

  function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement | HTMLVideoElement, cw: number, ch: number) {
    const iw = img instanceof HTMLVideoElement ? img.videoWidth || cw : img.width || cw;
    const ih = img instanceof HTMLVideoElement ? img.videoHeight || ch : img.height || ch;
    const scale = Math.max(cw / iw, ch / ih);
    const sw = iw * scale;
    const sh = ih * scale;
    const dx = (cw - sw) / 2;
    const dy = (ch - sh) / 2;
    ctx.drawImage(img, dx, dy, sw, sh);
  }

  function drawGradientBackdrop(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
    const grad = ctx.createLinearGradient(0, 0, cw, ch);
    if (bgGradient.value.includes('#f43f5e')) {
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#881337');
      grad.addColorStop(1, '#311042');
    } else if (bgGradient.value.includes('#f59e0b')) {
      grad.addColorStop(0, '#1c1917');
      grad.addColorStop(0.5, '#78350f');
      grad.addColorStop(1, '#0c0a09');
    } else {
      grad.addColorStop(0, '#064e3b');
      grad.addColorStop(0.5, '#0f172a');
      grad.addColorStop(1, '#312e81');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
  }

  function renderFrame() {
    const canvas = canvasRef.value;
    const video = videoRef.value;

    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const cw = canvas.width || 480;
        const ch = canvas.height || 480;
        ctx.clearRect(0, 0, cw, ch);

        const mode = bgMode.value;
        const hasVideo = Boolean(hasCameraStream.value && video && video.readyState >= 2);

        if (hasVideo && video) {
          if (mode === 'off') {
            ctx.save();
            if (isMirrored.value) {
              ctx.translate(cw, 0);
              ctx.scale(-1, 1);
            }
            drawCoverImage(ctx, video, cw, ch);
            ctx.restore();
          } else {
            // 1. Draw the chosen background layer first
            if (mode === 'blur') {
              ctx.save();
              if (isMirrored.value) {
                ctx.translate(cw, 0);
                ctx.scale(-1, 1);
              }
              ctx.filter = 'blur(16px) brightness(0.88)';
              drawCoverImage(ctx, video, cw, ch);
              ctx.restore();
            } else if (mode === 'image' && loadedBgImage && isBgImageLoaded.value) {
              drawCoverImage(ctx, loadedBgImage, cw, ch);
            } else if (mode === 'gradient' || (mode === 'image' && !isBgImageLoaded.value)) {
              drawGradientBackdrop(ctx, cw, ch);
            }
            // Note: for 'transparent', we leave the background layer completely clear (alpha = 0)

            // 2. Composite the segmented foreground subject with feathered edges
            const mask = computeForegroundMask(video);
            if (mask && fgCanvas) {
              if (fgCanvas.width !== cw || fgCanvas.height !== ch) {
                fgCanvas.width = cw;
                fgCanvas.height = ch;
              }
              const fgCtx = fgCanvas.getContext('2d');
              if (fgCtx) {
                fgCtx.clearRect(0, 0, cw, ch);
                fgCtx.save();
                if (isMirrored.value) {
                  fgCtx.translate(cw, 0);
                  fgCtx.scale(-1, 1);
                }
                // Draw soft feathered alpha mask
                fgCtx.filter = 'blur(6px)';
                fgCtx.drawImage(mask, 0, 0, cw, ch);
                fgCtx.filter = 'none';
                fgCtx.globalCompositeOperation = 'source-in';
                drawCoverImage(fgCtx, video, cw, ch);
                fgCtx.restore();

                ctx.drawImage(fgCanvas, 0, 0, cw, ch);
              }
            }
          }
        } else {
          // Fallback live background preview when hardware webcam is off/unavailable
          if (mode === 'image' && loadedBgImage && isBgImageLoaded.value) {
            drawCoverImage(ctx, loadedBgImage, cw, ch);
          } else if (mode === 'gradient') {
            drawGradientBackdrop(ctx, cw, ch);
          } else if (mode === 'blur') {
            ctx.save();
            ctx.filter = 'blur(12px)';
            if (loadedBgImage && isBgImageLoaded.value) {
              drawCoverImage(ctx, loadedBgImage, cw, ch);
            } else {
              drawGradientBackdrop(ctx, cw, ch);
            }
            ctx.restore();
          } else if (mode === 'off') {
            const fallbackGrad = ctx.createLinearGradient(0, 0, 0, ch);
            fallbackGrad.addColorStop(0, '#161922');
            fallbackGrad.addColorStop(0.5, '#0e1017');
            fallbackGrad.addColorStop(1, '#07080b');
            ctx.fillStyle = fallbackGrad;
            ctx.fillRect(0, 0, cw, ch);
          }

          // Draw subtle fallback FaceCam silhouette on canvas so MediaRecorder always captures valid video frames
          const cx = cw / 2;
          const cy = ch / 2 - ch * 0.04;
          const r = Math.min(cw, ch) * 0.14;
          const pulse = 1 + 0.04 * Math.sin(Date.now() / 260);

          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(251, 113, 133, 0.45)';
          ctx.stroke();

          // Head & shoulders icon inside circle
          ctx.beginPath();
          ctx.arc(cx, cy - r * 0.18, r * 0.28, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(254, 205, 211, 0.85)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(cx, cy + r * 0.42, r * 0.46, Math.PI * 1.15, Math.PI * 1.85);
          ctx.strokeStyle = 'rgba(254, 205, 211, 0.85)';
          ctx.lineWidth = Math.max(3, r * 0.14);
          ctx.lineCap = 'round';
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    animFrameId = requestAnimationFrame(renderFrame);
  }

  function startSegmentationLoop() {
    if (animFrameId !== null) return;
    animFrameId = requestAnimationFrame(renderFrame);
  }

  function stopSegmentationLoop() {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  onUnmounted(() => {
    stopSegmentationLoop();
  });

  return {
    isBgImageLoaded,
    startSegmentationLoop,
    stopSegmentationLoop,
  };
}
