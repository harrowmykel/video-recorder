import { RecordingSession, AudioLevels } from '../types/studio';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const channel = typeof window !== 'undefined' && 'BroadcastChannel' in window ? new BroadcastChannel('studio_recorder_bus') : null;

export async function invokeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(cmd, args);
    } catch (e) {
      console.warn(`[Tauri IPC] Error invoking ${cmd}:`, e);
      throw e;
    }
  }

  // Web fallback simulation
  return mockCommandResponse<T>(cmd, args);
}

export function broadcastEvent(event: string, payload: unknown) {
  if (channel) {
    channel.postMessage({ event, payload });
  }
}

export function subscribeToEvent<T>(event: string, callback: (payload: T) => void): () => void {
  if (!channel) return () => {};

  const listener = (msg: MessageEvent) => {
    if (msg.data?.event === event) {
      callback(msg.data.payload);
    }
  };

  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}

function mockCommandResponse<T>(cmd: string, _args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case 'start_recording':
      return Promise.resolve({ session_id: `rec_${Date.now()}` } as unknown as T);
    case 'stop_recording':
      return Promise.resolve({
        id: `rec_${Date.now()}`,
        timestamp: new Date().toISOString(),
        durationMs: 42000,
        screenPath: '/videos/sample_screen.mp4',
        cameraRawPath: '/videos/sample_camera_raw.mp4',
        cameraAlphaPath: '/videos/sample_camera_alpha.webm',
        micAudioPath: '/videos/audio_mic.wav',
        sysAudioPath: '/videos/audio_sys.wav',
        telemetryPath: '/videos/telemetry.json',
        metadataPath: '/videos/meta.json',
      } as unknown as T);
    case 'get_audio_levels':
      return Promise.resolve({
        micRms: 0.35 + Math.random() * 0.2,
        micPeak: 0.65,
        sysRms: 0.15,
        sysPeak: 0.3,
      } as unknown as T);
    default:
      return Promise.resolve(true as unknown as T);
  }
}
