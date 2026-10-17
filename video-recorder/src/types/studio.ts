export type RecordingState = 'idle' | 'countdown' | 'recording' | 'paused' | 'review';

export type CameraShape = 'circle' | 'squircle' | 'rect16_9';
export type CameraSize = 'S' | 'M' | 'L' | 'fullscreen';

export type BgRemovalMode = 'off' | 'blur' | 'transparent' | 'color' | 'gradient';
export type BgModelType = 'mediapipe_fast' | 'rvm_video' | 'birefnet_hq' | 'rmbg_1_4';

export interface TelemetryPoint {
  timestamp_us: number;
  x: number;
  y: number;
  button_down?: 'left' | 'right' | 'middle';
  zoom_factor: number;
}

export interface AudioLevels {
  micRms: number; // 0.0 to 1.0
  micPeak: number;
  sysRms: number;
  sysPeak: number;
}

export interface RecordingSession {
  id: string;
  timestamp: string;
  durationMs: number;
  screenPath: string;
  cameraRawPath: string;
  cameraAlphaPath?: string;
  micAudioPath: string;
  sysAudioPath: string;
  telemetryPath: string;
  metadataPath: string;
}

export interface BatchMattingJob {
  id: string;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progressPct: number;
  fps: number;
  etaSeconds: number;
  outputFormat: 'prores_4444' | 'webm_alpha' | 'luma_matte';
  outputPath?: string;
}

export type AnnotationTool = 'select' | 'pen' | 'arrow' | 'rect' | 'badge' | 'spotlight';

export interface AnnotationItem {
  id: string;
  tool: AnnotationTool;
  color: string;
  strokeWidth: number;
  points: { x: number; y: number }[];
  text?: string;
  createdAt: number;
}
