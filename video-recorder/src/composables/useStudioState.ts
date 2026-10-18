import { shallowRef, ref, computed, watch } from 'vue';
import type {
  RecordingState,
  CameraShape,
  CameraSize,
  BgRemovalMode,
  BgModelType,
  BgEngineType,
  CaptureSourceMode,
  CaptureAreaRect,
  RecordingSession,
  CameraTelemetryPoint,
  BgPresetItem,
} from '../types/studio';
import { broadcastEvent, subscribeToEvent } from '../lib/tauriBridge';

const STORAGE_KEY_SETTINGS = 'studio_recorder_settings_v1';

// Built-in offline high-resolution SVG Studio Background Images (100% offline data URIs)
export const STUDIO_BG_PRESETS: BgPresetItem[] = [
  {
    id: 'neon_studio',
    name: 'Cyber Neon Loft',
    type: 'image',
    value: `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#090d16"/>
            <stop offset="50%" stop-color="#111827"/>
            <stop offset="100%" stop-color="#1e1b4b"/>
          </linearGradient>
          <radialGradient id="glow1" cx="0.2" cy="0.3" r="0.5">
            <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#f43f5e" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="glow2" cx="0.8" cy="0.7" r="0.5">
            <stop offset="0%" stop-color="#6366f1" stop-opacity="0.5"/>
            <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="1280" height="720" fill="url(#bg)"/>
        <rect width="1280" height="720" fill="url(#glow1)"/>
        <rect width="1280" height="720" fill="url(#glow2)"/>
        <g stroke="#ffffff" stroke-opacity="0.06" stroke-width="2">
          <line x1="0" y1="180" x2="1280" y2="180"/>
          <line x1="0" y1="360" x2="1280" y2="360"/>
          <line x1="0" y1="540" x2="1280" y2="540"/>
          <line x1="320" y1="0" x2="320" y2="720"/>
          <line x1="640" y1="0" x2="640" y2="720"/>
          <line x1="960" y1="0" x2="960" y2="720"/>
        </g>
        <rect x="140" y="90" width="12" height="540" rx="6" fill="#f43f5e" opacity="0.85"/>
        <rect x="1128" y="90" width="12" height="540" rx="6" fill="#38bdf8" opacity="0.85"/>
      </svg>
    `)}`,
    thumbnail: 'linear-gradient(135deg, #090d16 0%, #f43f5e 50%, #6366f1 100%)',
  },
  {
    id: 'warm_architect',
    name: 'Nordic Wood & Bookshelf',
    type: 'image',
    value: `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <defs>
          <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#1c1917"/>
            <stop offset="50%" stop-color="#292524"/>
            <stop offset="100%" stop-color="#0c0a09"/>
          </linearGradient>
          <radialGradient id="lamp" cx="0.78" cy="0.25" r="0.55">
            <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="1280" height="720" fill="url(#wall)"/>
        <rect width="1280" height="720" fill="url(#lamp)"/>
        <!-- Wood slats -->
        <g fill="#44403c" opacity="0.45">
          <rect x="80" y="0" width="24" height="720"/>
          <rect x="128" y="0" width="24" height="720"/>
          <rect x="176" y="0" width="24" height="720"/>
          <rect x="224" y="0" width="24" height="720"/>
          <rect x="272" y="0" width="24" height="720"/>
          <rect x="320" y="0" width="24" height="720"/>
        </g>
        <!-- Minimal shelves -->
        <rect x="780" y="210" width="380" height="14" rx="4" fill="#78716c"/>
        <rect x="780" y="410" width="380" height="14" rx="4" fill="#78716c"/>
        <circle cx="990" cy="140" r="45" fill="#fbbf24" opacity="0.35"/>
      </svg>
    `)}`,
    thumbnail: 'linear-gradient(135deg, #1c1917 0%, #78716c 50%, #f59e0b 100%)',
  },
  {
    id: 'sunset_glass',
    name: 'Executive Glass Skyline',
    type: 'image',
    value: `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0f172a"/>
            <stop offset="55%" stop-color="#311042"/>
            <stop offset="100%" stop-color="#7c2d12"/>
          </linearGradient>
        </defs>
        <rect width="1280" height="720" fill="url(#sky)"/>
        <!-- City bokeh lights -->
        <g fill="#fb923c" opacity="0.35">
          <circle cx="220" cy="480" r="32"/>
          <circle cx="380" cy="520" r="24"/>
          <circle cx="540" cy="490" r="40"/>
          <circle cx="880" cy="510" r="36"/>
          <circle cx="1040" cy="470" r="28"/>
        </g>
        <g fill="#38bdf8" opacity="0.25">
          <circle cx="300" cy="550" r="26"/>
          <circle cx="720" cy="530" r="34"/>
          <circle cx="960" cy="540" r="30"/>
        </g>
        <!-- Window mullions -->
        <rect x="420" y="0" width="10" height="720" fill="#020617" opacity="0.7"/>
        <rect x="860" y="0" width="10" height="720" fill="#020617" opacity="0.7"/>
      </svg>
    `)}`,
    thumbnail: 'linear-gradient(135deg, #0f172a 0%, #311042 50%, #fb923c 100%)',
  },
  {
    id: 'aurora_gradient',
    name: 'Emerald Aurora Mesh',
    type: 'gradient',
    value: 'linear-gradient(135deg, #064e3b 0%, #0f172a 50%, #312e81 100%)',
    thumbnail: 'linear-gradient(135deg, #10b981 0%, #0f172a 50%, #6366f1 100%)',
  },
];

// Global Singleton State
const recordingState = shallowRef<RecordingState>('idle');
const isCameraHidden = shallowRef(false);
const isDockedToCamera = shallowRef(false);
const isAnnotationActive = shallowRef(false);
const isLiveZoomActive = shallowRef(false);
const isToolbarCollapsed = shallowRef(false);

// Capture Source State
const captureSourceMode = shallowRef<CaptureSourceMode>('display');
const selectedDisplayId = shallowRef<string>('primary');
const selectedWindowId = shallowRef<string>('');
const selectedWindowTitle = shallowRef<string>('Entire Screen');
const captureArea = ref<CaptureAreaRect>({ x: 160, y: 120, width: 1280, height: 720 });
const isAreaSelectorOpen = shallowRef(false);
const isSourceModalOpen = shallowRef(false);
const targetFps = shallowRef<number>(60);

// Audio & Camera Device State
const selectedCameraId = shallowRef<string>('default');
const isCameraDisabled = computed(() => selectedCameraId.value === 'none');
const selectedMicId = shallowRef<string>('default');
const isMicMuted = shallowRef(false);
const isSysAudioMuted = shallowRef(false);

// Camera Appearance & Real-time Background State
const cameraShape = shallowRef<CameraShape>('circle');
const cameraSize = shallowRef<CameraSize>('M');
const cameraCustomDiameter = shallowRef<number | null>(null);
const isCameraMirrored = shallowRef(true);
const bgMode = shallowRef<BgRemovalMode>('off');
const selectedBgModel = shallowRef<BgModelType>('mediapipe_fast');
const bgEngine = shallowRef<BgEngineType>('rust');
const bgImageUrl = shallowRef<string>(STUDIO_BG_PRESETS[0].value);
const bgGradient = shallowRef<string>('linear-gradient(135deg, #064e3b 0%, #0f172a 50%, #312e81 100%)');

// Session & Telemetry State
const lastRecordedSession = ref<RecordingSession | null>(null);
const sessionCameraTelemetry = ref<CameraTelemetryPoint[]>([]);

let isInitialized = false;
let isSyncingFromBus = false;

function loadPersistedSettings() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.captureSourceMode) captureSourceMode.value = data.captureSourceMode;
    if (data.selectedDisplayId) selectedDisplayId.value = data.selectedDisplayId;
    if (data.selectedWindowId !== undefined) selectedWindowId.value = data.selectedWindowId;
    if (data.selectedWindowTitle) selectedWindowTitle.value = data.selectedWindowTitle;
    if (data.captureArea) captureArea.value = data.captureArea;
    if (data.targetFps) targetFps.value = data.targetFps;
    if (data.selectedCameraId) selectedCameraId.value = data.selectedCameraId;
    if (data.selectedMicId) selectedMicId.value = data.selectedMicId;
    if (typeof data.isMicMuted === 'boolean') isMicMuted.value = data.isMicMuted;
    if (typeof data.isSysAudioMuted === 'boolean') isSysAudioMuted.value = data.isSysAudioMuted;
    if (data.cameraShape) cameraShape.value = data.cameraShape;
    if (data.cameraSize) cameraSize.value = data.cameraSize;
    if (typeof data.isCameraMirrored === 'boolean') isCameraMirrored.value = data.isCameraMirrored;
    if (data.bgMode) bgMode.value = data.bgMode;
    if (data.selectedBgModel) selectedBgModel.value = data.selectedBgModel;
    if (data.bgEngine) bgEngine.value = data.bgEngine;
    if (data.bgImageUrl) bgImageUrl.value = data.bgImageUrl;
    if (data.bgGradient) bgGradient.value = data.bgGradient;
    if (data.lastRecordedSession) lastRecordedSession.value = data.lastRecordedSession;
  } catch (err) {
    console.warn('[useStudioState] Failed to parse saved settings:', err);
  }
}

function savePersistedSettings() {
  if (typeof window === 'undefined') return;
  try {
    const payload = {
      captureSourceMode: captureSourceMode.value,
      selectedDisplayId: selectedDisplayId.value,
      selectedWindowId: selectedWindowId.value,
      selectedWindowTitle: selectedWindowTitle.value,
      captureArea: captureArea.value,
      targetFps: targetFps.value,
      selectedCameraId: selectedCameraId.value,
      selectedMicId: selectedMicId.value,
      isMicMuted: isMicMuted.value,
      isSysAudioMuted: isSysAudioMuted.value,
      cameraShape: cameraShape.value,
      cameraSize: cameraSize.value,
      isCameraMirrored: isCameraMirrored.value,
      bgMode: bgMode.value,
      selectedBgModel: selectedBgModel.value,
      bgEngine: bgEngine.value,
      bgImageUrl: bgImageUrl.value,
      bgGradient: bgGradient.value,
      lastRecordedSession: lastRecordedSession.value,
    };
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(payload));
  } catch (err) {
    console.warn('[useStudioState] Could not persist settings to localStorage:', err);
  }
}

function broadcastFullState() {
  if (isSyncingFromBus) return;
  savePersistedSettings();
  broadcastEvent('sync_state', {
    recordingState: recordingState.value,
    isCameraHidden: isCameraHidden.value,
    isDockedToCamera: isDockedToCamera.value,
    isAnnotationActive: isAnnotationActive.value,
    isLiveZoomActive: isLiveZoomActive.value,
    isToolbarCollapsed: isToolbarCollapsed.value,
    captureSourceMode: captureSourceMode.value,
    selectedDisplayId: selectedDisplayId.value,
    selectedWindowId: selectedWindowId.value,
    selectedWindowTitle: selectedWindowTitle.value,
    captureArea: { ...captureArea.value },
    isAreaSelectorOpen: isAreaSelectorOpen.value,
    isSourceModalOpen: isSourceModalOpen.value,
    targetFps: targetFps.value,
    selectedCameraId: selectedCameraId.value,
    selectedMicId: selectedMicId.value,
    isMicMuted: isMicMuted.value,
    isSysAudioMuted: isSysAudioMuted.value,
    cameraShape: cameraShape.value,
    cameraSize: cameraSize.value,
    cameraCustomDiameter: cameraCustomDiameter.value,
    isCameraMirrored: isCameraMirrored.value,
    bgMode: bgMode.value,
    selectedBgModel: selectedBgModel.value,
    bgEngine: bgEngine.value,
    bgImageUrl: bgImageUrl.value,
    bgGradient: bgGradient.value,
    lastRecordedSession: lastRecordedSession.value ? { ...lastRecordedSession.value } : null,
  });
}

export function useStudioState() {
  if (!isInitialized && typeof window !== 'undefined') {
    isInitialized = true;
    loadPersistedSettings();

    subscribeToEvent<Record<string, any>>('sync_state', (payload) => {
      if (!payload) return;
      isSyncingFromBus = true;
      if (payload.recordingState !== undefined) recordingState.value = payload.recordingState;
      if (payload.isCameraHidden !== undefined) isCameraHidden.value = payload.isCameraHidden;
      if (payload.isDockedToCamera !== undefined) isDockedToCamera.value = payload.isDockedToCamera;
      if (payload.isAnnotationActive !== undefined) isAnnotationActive.value = payload.isAnnotationActive;
      if (payload.isLiveZoomActive !== undefined) isLiveZoomActive.value = payload.isLiveZoomActive;
      if (payload.isToolbarCollapsed !== undefined) isToolbarCollapsed.value = payload.isToolbarCollapsed;
      if (payload.captureSourceMode !== undefined) captureSourceMode.value = payload.captureSourceMode;
      if (payload.selectedDisplayId !== undefined) selectedDisplayId.value = payload.selectedDisplayId;
      if (payload.selectedWindowId !== undefined) selectedWindowId.value = payload.selectedWindowId;
      if (payload.selectedWindowTitle !== undefined) selectedWindowTitle.value = payload.selectedWindowTitle;
      if (payload.captureArea !== undefined) captureArea.value = { ...payload.captureArea };
      if (payload.isAreaSelectorOpen !== undefined) isAreaSelectorOpen.value = payload.isAreaSelectorOpen;
      if (payload.isSourceModalOpen !== undefined) isSourceModalOpen.value = payload.isSourceModalOpen;
      if (payload.targetFps !== undefined) targetFps.value = payload.targetFps;
      if (payload.selectedCameraId !== undefined) selectedCameraId.value = payload.selectedCameraId;
      if (payload.selectedMicId !== undefined) selectedMicId.value = payload.selectedMicId;
      if (payload.isMicMuted !== undefined) isMicMuted.value = payload.isMicMuted;
      if (payload.isSysAudioMuted !== undefined) isSysAudioMuted.value = payload.isSysAudioMuted;
      if (payload.cameraShape !== undefined) cameraShape.value = payload.cameraShape;
      if (payload.cameraSize !== undefined) cameraSize.value = payload.cameraSize;
      if (payload.cameraCustomDiameter !== undefined) cameraCustomDiameter.value = payload.cameraCustomDiameter;
      if (payload.isCameraMirrored !== undefined) isCameraMirrored.value = payload.isCameraMirrored;
      if (payload.bgMode !== undefined) bgMode.value = payload.bgMode;
      if (payload.selectedBgModel !== undefined) selectedBgModel.value = payload.selectedBgModel;
      if (payload.bgEngine !== undefined) bgEngine.value = payload.bgEngine;
      if (payload.bgImageUrl !== undefined) bgImageUrl.value = payload.bgImageUrl;
      if (payload.bgGradient !== undefined) bgGradient.value = payload.bgGradient;
      if (payload.lastRecordedSession !== undefined) lastRecordedSession.value = payload.lastRecordedSession;

      setTimeout(() => {
        isSyncingFromBus = false;
      }, 40);
    });

    // Listen to storage events across browser tabs when not using Electron IPC
    if (!window.__ELECTRON_OVERLAY__) {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY_SETTINGS && e.newValue) {
          isSyncingFromBus = true;
          loadPersistedSettings();
          setTimeout(() => {
            isSyncingFromBus = false;
          }, 40);
        }
      });
    }

    watch(
      [
        recordingState,
        isCameraHidden,
        isDockedToCamera,
        isAnnotationActive,
        isLiveZoomActive,
        isToolbarCollapsed,
        captureSourceMode,
        selectedDisplayId,
        selectedWindowId,
        selectedWindowTitle,
        captureArea,
        isAreaSelectorOpen,
        isSourceModalOpen,
        targetFps,
        selectedCameraId,
        selectedMicId,
        isMicMuted,
        isSysAudioMuted,
        cameraShape,
        cameraSize,
        cameraCustomDiameter,
        isCameraMirrored,
        bgMode,
        selectedBgModel,
        bgEngine,
        bgImageUrl,
        bgGradient,
        lastRecordedSession,
      ],
      () => {
        broadcastFullState();
      },
      { deep: true }
    );
  }

  function setCustomBgImageFromFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        bgImageUrl.value = dataUrl;
        bgMode.value = 'image';
        resolve(dataUrl);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  function cycleBgMode() {
    const order: BgRemovalMode[] = ['off', 'blur', 'transparent', 'image', 'gradient'];
    const idx = order.indexOf(bgMode.value);
    bgMode.value = order[(idx + 1) % order.length];
  }

  function cycleCameraShape() {
    const order: CameraShape[] = ['circle', 'squircle', 'rect16_9'];
    const idx = order.indexOf(cameraShape.value);
    cameraShape.value = order[(idx + 1) % order.length];
  }

  return {
    recordingState,
    isCameraHidden,
    isDockedToCamera,
    isAnnotationActive,
    isLiveZoomActive,
    isToolbarCollapsed,
    captureSourceMode,
    selectedDisplayId,
    selectedWindowId,
    selectedWindowTitle,
    captureArea,
    isAreaSelectorOpen,
    isSourceModalOpen,
    targetFps,
    selectedCameraId,
    isCameraDisabled,
    selectedMicId,
    isMicMuted,
    isSysAudioMuted,
    cameraShape,
    cameraSize,
    cameraCustomDiameter,
    isCameraMirrored,
    bgMode,
    selectedBgModel,
    bgEngine,
    bgImageUrl,
    bgGradient,
    lastRecordedSession,
    sessionCameraTelemetry,
    bgPresets: STUDIO_BG_PRESETS,
    setCustomBgImageFromFile,
    cycleBgMode,
    cycleCameraShape,
    broadcastFullState,
  };
}
