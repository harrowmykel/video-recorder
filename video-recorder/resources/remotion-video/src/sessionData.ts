export interface TakeSegment {
  file: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  width?: number;
  height?: number;
  sourceMode?: string;
}

export interface CameraTelemetryPoint {
  timeMs: number;
  x: number;
  y: number;
  normX: number;
  normY: number;
  width: number;
  height: number;
  shape: 'circle' | 'squircle' | 'rect16_9' | string;
  hidden: boolean;
}

export interface SessionConfig {
  sessionId: string;
  fps: number;
  width: number;
  height: number;
  totalDurationMs: number;
  durationInFrames: number;
  screenTakes: TakeSegment[];
  cameraTakes: TakeSegment[];
  micTakes: TakeSegment[];
  sysAudioTakes: TakeSegment[];
  telemetry: CameraTelemetryPoint[];
}

export const sessionData: SessionConfig = {
  sessionId: "sample_session",
  fps: 60,
  width: 1920,
  height: 1080,
  totalDurationMs: 15000,
  durationInFrames: 900,
  screenTakes: [],
  cameraTakes: [],
  micTakes: [],
  sysAudioTakes: [],
  telemetry: [
    {
      timeMs: 0,
      x: 1520,
      y: 780,
      normX: 0.7917,
      normY: 0.7222,
      width: 288,
      height: 288,
      shape: "circle",
      hidden: false,
    },
  ],
};
