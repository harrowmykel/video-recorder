// Universal Bridge for Native Desktop Overlays (Electron / Tauri v2) and Local Rust Capture Daemon

export interface ElectronOverlayAPI {
  send: (channel: string, payload?: unknown) => void;
  invoke?: (channel: string, payload?: unknown) => Promise<any>;
  on: (channel: string, callback: (payload: any) => void) => () => void;
}

declare global {
  interface Window {
    __ELECTRON_OVERLAY__?: ElectronOverlayAPI;
  }
}

let activeDaemonUrl: string | null = null;
let lastProbeTime = 0;

export async function resolveDaemonUrl(): Promise<string> {
  const now = Date.now();
  if (activeDaemonUrl && now - lastProbeTime < 8000) {
    return activeDaemonUrl;
  }

  // Dynamic range probe: 4820 through 4835
  const candidatePorts = [4820, 4821, 4822, 4823, 4824, 4825, 4826, 4827, 4828, 4829, 4830];

  for (const port of candidatePorts) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180);
      const res = await fetch(`http://127.0.0.1:${port}/status`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        activeDaemonUrl = `http://127.0.0.1:${port}`;
        lastProbeTime = now;
        return activeDaemonUrl;
      }
    } catch {
      // Continue searching
    }
  }

  return 'http://127.0.0.1:4820';
}

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
      const daemonBase = await resolveDaemonUrl();
      const resp = await fetch(`${daemonBase}${endpoint}`, {
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

export async function getDefaultVideosDirectory(): Promise<string> {
  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__?.invoke) {
    try {
      const dir = await window.__ELECTRON_OVERLAY__.invoke('get_default_videos_dir');
      if (dir) return dir;
    } catch {}
  }
  return '~/Videos/record_studio';
}

export async function openExportDirectory(targetPath: string): Promise<{ success: boolean; error?: string }> {
  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__?.invoke) {
    try {
      return await window.__ELECTRON_OVERLAY__.invoke('open_path', targetPath);
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: 'Opening folder in file manager is only available in Desktop application.' };
}

export async function getCameraTelemetry(): Promise<any[]> {
  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__?.invoke) {
    try {
      return await window.__ELECTRON_OVERLAY__.invoke('get_camera_telemetry') || [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function selectExportDirectory(defaultPath?: string): Promise<string | null> {
  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__?.invoke) {
    try {
      const selected = await window.__ELECTRON_OVERLAY__.invoke('select_directory', defaultPath);
      if (selected) return selected;
    } catch (e) {
      console.warn('[Electron] select_directory error:', e);
    }
  }

  // Fallback to HTML5 directory picker if available in modern browser
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      if (dirHandle?.name) {
        return `~/Videos/record_studio/${dirHandle.name}`;
      }
    } catch {
      // User cancelled
    }
  }

  return null;
}

export async function exportSessionPackage(
  targetDir: string,
  sessionMetadata?: unknown,
  preset: string = 'premiere_xml'
): Promise<{ success: boolean; targetDir?: string; error?: string }> {
  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__?.invoke) {
    try {
      return await window.__ELECTRON_OVERLAY__.invoke('export_session_package', { targetDir, sessionMetadata, preset });
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // Browser simulation
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { success: true, targetDir };
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
