import type { Component } from 'vue';

export type RecordingState = 'idle' | 'countdown' | 'recording' | 'paused' | 'review';

export type CameraShape = 'circle' | 'squircle' | 'rect16_9';
export type CameraSize = 'S' | 'M' | 'L' | 'fullscreen';

export type BgRemovalMode = 'off' | 'blur' | 'transparent' | 'color' | 'image' | 'gradient';
export type BgModelType = 'mediapipe_fast' | 'rvm_video' | 'birefnet_hq' | 'rmbg_1_4';

export type CaptureSourceMode = 'display' | 'window' | 'area';

export interface CaptureSourceOption {
  mode: CaptureSourceMode;
  label: string;
  icon: Component;
  iconClass: string;
  title: string;
}

export interface CaptureAreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplaySourceInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isPrimary?: boolean;
}

export interface WindowSourceInfo {
  id: string;
  title: string;
  appName?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StartRecordingOptions {
  source_mode?: CaptureSourceMode;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  display_id?: string;
  window_id?: string;
  fps?: number;
  mic_muted?: boolean;
  sys_audio_muted?: boolean;
  camera_device?: string | 'none';
  mic_device?: string;
  chunk_duration_sec?: number;
}

export interface TelemetryPoint {
  timestamp_us: number;
  x: number;
  y: number;
  button_down?: 'left' | 'right' | 'middle';
  zoom_factor: number;
}

export interface CameraTelemetryPoint {
  timeMs: number;
  x: number;
  y: number;
  normX: number; // 0.0 - 1.0 relative to display width
  normY: number; // 0.0 - 1.0 relative to display height
  width: number;
  height: number;
  shape: CameraShape;
  hidden: boolean;
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
  screenUrl?: string;
  cameraUrl?: string;
  micUrl?: string;
  sysAudioUrl?: string;
  cameraTelemetry?: CameraTelemetryPoint[];
  screenManifest?: string;
  cameraManifest?: string;
  micManifest?: string;
  sysAudioManifest?: string;
  chunkCount?: number;
  chunkDurationSec?: number;
  status?: string;
  sessionDir?: string;
  notesPath?: string;
  hasNotes?: boolean;
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
  errorMessage?: string;
}

export type AnnotationTool = 'select' | 'pen' | 'arrow' | 'rect' | 'circle' | 'badge' | 'spotlight';

export interface AnnotationItem {
  id: string;
  tool: AnnotationTool;
  color: string;
  strokeWidth: number;
  points: { x: number; y: number }[];
  text?: string;
  createdAt: number;
}

export interface BgPresetItem {
  id: string;
  name: string;
  type: 'color' | 'image' | 'gradient';
  value: string;
  thumbnail: string;
}

export interface SavedBgImage {
  id: string;
  name: string;
  filePath: string;
  dataUrl: string;
  mtime: number;
}
