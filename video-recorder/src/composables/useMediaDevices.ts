import { ref, shallowRef, onMounted, onUnmounted } from 'vue';

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
  kind: 'videoinput' | 'audioinput' | 'audiooutput';
}

const cameras = ref<MediaDeviceOption[]>([]);
const microphones = ref<MediaDeviceOption[]>([]);
const liveMicLevel = shallowRef<number>(0);

let isEnumerating = false;
let audioCtx: AudioContext | null = null;
let micStream: MediaStream | null = null;
let meterAnimFrame: number | null = null;

export function useMediaDevices() {
  async function refreshDevices(requestPermissionIfEmpty = false) {
    if (isEnumerating || typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    isEnumerating = true;
    try {
      let list = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = list.some((d) => d.label && d.label.trim().length > 0);

      if (!hasLabels && requestPermissionIfEmpty && navigator.mediaDevices.getUserMedia) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          tempStream.getTracks().forEach((t) => t.stop());
          list = await navigator.mediaDevices.enumerateDevices();
        } catch {
          // Try video or audio individually
          try {
            const vStream = await navigator.mediaDevices.getUserMedia({ video: true });
            vStream.getTracks().forEach((t) => t.stop());
            list = await navigator.mediaDevices.enumerateDevices();
          } catch {}
        }
      }

      const videoInputs: MediaDeviceOption[] = [];
      const audioInputs: MediaDeviceOption[] = [];

      list.forEach((d, idx) => {
        if (d.kind === 'videoinput') {
          videoInputs.push({
            deviceId: d.deviceId || `cam_${idx}`,
            label: d.label || `Camera ${videoInputs.length + 1}`,
            kind: 'videoinput',
          });
        } else if (d.kind === 'audioinput') {
          audioInputs.push({
            deviceId: d.deviceId || `mic_${idx}`,
            label: d.label || `Microphone ${audioInputs.length + 1}`,
            kind: 'audioinput',
          });
        }
      });

      if (videoInputs.length === 0) {
        videoInputs.push(
          { deviceId: 'default', label: 'Default System Camera (/dev/video0)', kind: 'videoinput' },
          { deviceId: '/dev/video1', label: 'Secondary Capture Device (/dev/video1)', kind: 'videoinput' }
        );
      }

      if (audioInputs.length === 0) {
        audioInputs.push(
          { deviceId: 'default', label: 'Default System Microphone (PulseAudio)', kind: 'audioinput' }
        );
      }

      cameras.value = videoInputs;
      microphones.value = audioInputs;
    } catch (err) {
      console.warn('[useMediaDevices] Could not enumerate devices:', err);
    } finally {
      isEnumerating = false;
    }
  }

  async function startMicMeter(deviceId?: string) {
    stopMicMeter();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : true,
        video: false,
      };
      micStream = await navigator.mediaDevices.getUserMedia(constraints);
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(micStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        if (!audioCtx) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length / 255;
        liveMicLevel.value = Math.min(1, avg * 2.4);
        meterAnimFrame = requestAnimationFrame(updateMeter);
      };
      meterAnimFrame = requestAnimationFrame(updateMeter);
    } catch {
      // Fallback subtle level when hardware mic isn't accessible in browser preview
      liveMicLevel.value = 0.2;
    }
  }

  function stopMicMeter() {
    if (meterAnimFrame !== null) {
      cancelAnimationFrame(meterAnimFrame);
      meterAnimFrame = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  }

  const handleDeviceChange = () => {
    refreshDevices(false);
  };

  onMounted(() => {
    refreshDevices(false);
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
  });

  onUnmounted(() => {
    navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
  });

  return {
    cameras,
    microphones,
    liveMicLevel,
    refreshDevices,
    startMicMeter,
    stopMicMeter,
  };
}
