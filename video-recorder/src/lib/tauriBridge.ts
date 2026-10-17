// Universal Bridge for Native Desktop Overlays (Electron / Tauri v2) and Local Rust Capture Daemon

export interface ElectronOverlayAPI {
  send: (channel: string, payload?: unknown) => void;
  on: (channel: string, callback: (payload: any) => void) => () => void;
}

declare global {
  interface Window {
    __ELECTRON_OVERLAY__?: ElectronOverlayAPI;
  }
}

const DAEMON_URL = 'http://127.0.0.1:4820';
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const channel = typeof window !== 'undefined' && 'BroadcastChannel' in window ? new BroadcastChannel('studio_recorder_bus') : null;

export function isNativeOverlayWindow(): boolean {
  return typeof window !== 'undefined' && (isTauri || Boolean(window.__ELECTRON_OVERLAY__));
}

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

  // 2. Communicate with local Rust capture daemon
  try {
    let endpoint = '';
    let method = 'POST';
    let body: unknown = null;

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
      case 'toggle_live_zoom':
        endpoint = '/toggle_zoom';
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
  } catch (_err) {
    // Daemon offline, gracefully fallback to preview simulation
    console.log(`[Rust Daemon] Offline, using interactive simulation for ${cmd}`);
  }

  return mockCommandResponse<T>(cmd, args);
}

export function broadcastEvent(event: string, payload: unknown) {
  if (channel) {
    channel.postMessage({ event, payload });
  }
  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__) {
    window.__ELECTRON_OVERLAY__.send('overlay_event', { event, payload });
  }
}

export function subscribeToEvent<T>(event: string, callback: (payload: T) => void): () => void {
  const cleanups: Array<() => void> = [];

  if (channel) {
    const listener = (msg: MessageEvent) => {
      if (msg.data?.event === event) {
        callback(msg.data.payload);
      }
    };
    channel.addEventListener('message', listener);
    cleanups.push(() => channel.removeEventListener('message', listener));
  }

  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__) {
    const unsub = window.__ELECTRON_OVERLAY__.on('overlay_event', (data: { event: string; payload: T }) => {
      if (data?.event === event) {
        callback(data.payload);
      }
    });
    cleanups.push(unsub);
  }

  return () => {
    cleanups.forEach((fn) => fn());
  };
}

export async function moveOverlayWindow(windowLabel: string, dx: number, dy: number) {
  if (dx === 0 && dy === 0) return;

  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__) {
    window.__ELECTRON_OVERLAY__.send('move_window', { windowLabel, dx, dy });
    return;
  }

  if (isTauri) {
    try {
      const { getCurrentWindow, PhysicalPosition } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      await win.setPosition(new PhysicalPosition(pos.x + dx, pos.y + dy));
    } catch (e) {
      console.warn('[Tauri Window] move failed:', e);
    }
  }
}

export async function resizeOverlayWindow(windowLabel: string, width: number, height: number) {
  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__) {
    window.__ELECTRON_OVERLAY__.send('resize_window', { windowLabel, width, height });
    return;
  }

  if (isTauri) {
    try {
      const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.setSize(new LogicalSize(width, height));
    } catch (e) {
      console.warn('[Tauri Window] resize failed:', e);
    }
  }
}

export function quitOverlayApp() {
  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__) {
    window.__ELECTRON_OVERLAY__.send('quit_app');
  } else if (typeof window !== 'undefined') {
    window.close();
  }
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
