// Universal Bridge for Tauri v2 Desktop and Local Rust Capture Daemon

import { RecordingSession, AudioLevels } from '../types/studio';

const DAEMON_URL = 'http://127.0.0.1:4820';
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const channel = typeof window !== 'undefined' && 'BroadcastChannel' in window ? new BroadcastChannel('studio_recorder_bus') : null;

export async function invokeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // 1. If running inside native Tauri runtime
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(cmd, args);
    } catch (e) {
      console.warn(`[Tauri IPC] Error invoking ${cmd}:`, e);
      throw e;
    }
  }

  // 2. If running in browser, communicate with local Rust capture daemon
  try {
    let endpoint = '';
    let method = 'POST';
    let body: any = null;

    switch (cmd) {
      case 'start_recording':
        endpoint = '/start';
        break;
      case 'stop_recording':
        endpoint = '/stop';
        break;
      case 'discard_recording':
        endpoint = '/discard';
        break;
      case 'extract_transparent_background':
        endpoint = '/extract_bg';
        body = args;
        break;
      case 'get_status':
        endpoint = '/status';
        method = 'GET';
        break;
      default:
        endpoint = '';
    }

    if (endpoint) {
      const resp = await fetch(`${DAEMON_URL}${endpoint}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (resp.ok) {
        const json = await resp.json();
        console.log(`[Rust Daemon Response] ${cmd}:`, json);
        return json as T;
      }
    }
  } catch (err) {
    // Daemon offline, gracefully fallback to preview simulation
    console.log(`[Rust Daemon] Offline, using interactive simulation for ${cmd}`);
  }

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
