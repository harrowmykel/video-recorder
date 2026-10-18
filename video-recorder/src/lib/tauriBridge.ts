// Universal Bridge for Native Desktop Overlays (Electron / Tauri v2) and Local Rust Capture Daemon

import type { DisplaySourceInfo, WindowSourceInfo, RecordingSession } from '../types/studio';

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

  // Dynamic range probe: 4820 through 4830
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
const channel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('studio_recorder_bus')
    : null;

export function isNativeOverlayWindow(): boolean {
  return typeof window !== 'undefined' && (isTauri || Boolean(window.__ELECTRON_OVERLAY__));
}

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

  try {
    let endpoint = '';
    let method = 'POST';
    let body: unknown = null;

    switch (cmd) {
      case 'start_recording':
        endpoint = '/start';
        body = args || {};
        break;
      case 'pause_recording':
        endpoint = '/pause';
        break;
      case 'resume_recording':
        endpoint = '/resume';
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
      case 'get_sources':
        endpoint = '/sources';
        method = 'GET';
        break;
      case 'get_sessions':
        endpoint = '/sessions';
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
        return json as T;
      }
    }
  } catch (_err) {
    console.log(`[Rust Daemon] Offline, using interactive simulation for ${cmd}`);
  }

  return mockCommandResponse<T>(cmd, args);
}

export async function fetchCaptureSources(): Promise<{
  displays: DisplaySourceInfo[];
  windows: WindowSourceInfo[];
}> {
  try {
    const res = await invokeCommand<{
      displays?: Array<{
        id: string;
        name: string;
        x: number;
        y: number;
        width: number;
        height: number;
        is_primary?: boolean;
      }>;
      windows?: Array<{
        id: string;
        title: string;
        app_name?: string;
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
    }>('get_sources');

    const displays: DisplaySourceInfo[] = (res?.displays || []).map((d) => ({
      id: d.id,
      name: d.name,
      x: d.x,
      y: d.y,
      width: d.width,
      height: d.height,
      isPrimary: d.is_primary,
    }));

    const windows: WindowSourceInfo[] = (res?.windows || []).map((w) => ({
      id: w.id,
      title: w.title,
      appName: w.app_name || 'Application',
      x: w.x,
      y: w.y,
      width: w.width,
      height: w.height,
    }));

    if (displays.length > 0 || windows.length > 0) {
      return { displays, windows };
    }
  } catch {}

  const w = typeof window !== 'undefined' && window.screen?.width ? window.screen.width : 1920;
  const h = typeof window !== 'undefined' && window.screen?.height ? window.screen.height : 1080;

  return {
    displays: [
      { id: 'primary', name: `Primary Display (${w}×${h})`, x: 0, y: 0, width: w, height: h, isPrimary: true },
    ],
    windows: [
      { id: 'win_vscode', title: 'Visual Studio Code — video-recorder', appName: 'Code', x: 50, y: 32, width: 1600, height: 960 },
      { id: 'win_browser', title: 'Browser — localhost:1420', appName: 'Browser', x: 80, y: 40, width: 1440, height: 900 },
      { id: 'win_terminal', title: 'Terminal — bash', appName: 'Terminal', x: 200, y: 120, width: 960, height: 640 },
    ],
  };
}

export async function uploadRecordedCameraTrack(blob: Blob): Promise<string | null> {
  try {
    const daemonBase = await resolveDaemonUrl();
    const resp = await fetch(`${daemonBase}/upload_camera_track`, {
      method: 'POST',
      body: blob,
    });
    if (resp.ok) {
      const json = await resp.json();
      return json?.camera_path || null;
    }
  } catch (err) {
    console.warn('[uploadRecordedCameraTrack] Failed to upload camera track:', err);
  }
  return null;
}

export async function uploadCameraChunk(
  blob: Blob,
  chunkIndex: number,
  metadata?: Record<string, any>
): Promise<string | null> {
  try {
    const daemonBase = await resolveDaemonUrl();
    const headers: Record<string, string> = {
      'x-chunk-index': String(chunkIndex),
    };
    if (metadata) {
      headers['x-camera-metadata'] = JSON.stringify(metadata);
    }
    const resp = await fetch(`${daemonBase}/upload_camera_chunk`, {
      method: 'POST',
      headers,
      body: blob,
    });
    if (resp.ok) {
      const json = await resp.json();
      return json?.chunk_path || null;
    }
  } catch (err) {
    console.warn('[uploadCameraChunk] Failed to upload camera chunk:', err);
  }
  return null;
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__?.invoke) {
      try {
        const res = await window.__ELECTRON_OVERLAY__.invoke('delete_session', sessionId);
        if (res && res.success) return true;
      } catch {}
    }
    const daemonBase = await resolveDaemonUrl();
    const resp = await fetch(`${daemonBase}/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    if (resp.ok) {
      const json = await resp.json();
      return Boolean(json?.success && json?.deleted);
    }
  } catch (err) {
    console.warn('[deleteSession] Failed to delete session:', err);
  }
  return false;
}

export async function buildRecordingSessionFromDaemonMeta(meta: any): Promise<RecordingSession> {
  const daemonBase = await resolveDaemonUrl();
  const id = meta?.id || `session_${Date.now()}`;
  const ts = Date.now();
  return {
    id,
    timestamp: meta?.created_at || new Date().toISOString(),
    durationMs: meta?.duration_ms || 15000,
    screenPath: meta?.screen_track || `/recordings/${id}/screen_clean.mp4`,
    cameraRawPath: meta?.camera_raw_track || `/recordings/${id}/camera_raw.mp4`,
    cameraAlphaPath: meta?.camera_raw_track
      ? meta.camera_raw_track.replace('camera_raw.mp4', 'camera_alpha.webm')
      : `/recordings/${id}/camera_alpha.webm`,
    micAudioPath: meta?.mic_track || `/recordings/${id}/audio_mic.wav`,
    sysAudioPath: meta?.sys_audio_track || `/recordings/${id}/audio_system.wav`,
    telemetryPath: meta?.telemetry_file || `/recordings/${id}/telemetry.json`,
    metadataPath: meta?.session_dir ? `${meta.session_dir}/session_metadata.json` : `/recordings/${id}/session_metadata.json`,
    screenUrl: `${daemonBase}/media/${id}/screen_clean.mp4?t=${ts}`,
    cameraUrl: `${daemonBase}/media/${id}/camera_raw.mp4?t=${ts}`,
    micUrl: `${daemonBase}/media/${id}/audio_mic.wav?t=${ts}`,
    sysAudioUrl: `${daemonBase}/media/${id}/audio_system.wav?t=${ts}`,
    screenManifest: meta?.screen_manifest,
    cameraManifest: meta?.camera_manifest,
    micManifest: meta?.mic_manifest,
    sysAudioManifest: meta?.sys_audio_manifest,
    chunkCount: meta?.chunk_count,
  };
}


export async function fetchRecordedSessions(): Promise<RecordingSession[]> {
  try {
    const res = await invokeCommand<{ sessions?: any[] }>('get_sessions');
    if (res?.sessions && Array.isArray(res.sessions)) {
      const items: RecordingSession[] = [];
      for (const m of res.sessions) {
        items.push(await buildRecordingSessionFromDaemonMeta(m));
      }
      return items;
    }
  } catch {}
  return [];
}

function toSerializable<T>(value: T): T {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

export function broadcastEvent(event: string, payload: unknown) {
  const safePayload = toSerializable(payload);

  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__) {
    try {
      window.__ELECTRON_OVERLAY__.send('overlay_event', { event, payload: safePayload });
    } catch (err) {
      console.warn('[Electron IPC] Failed to send overlay_event:', err);
    }
    return;
  }

  if (channel) {
    try {
      channel.postMessage({ event, payload: safePayload });
    } catch (err) {
      console.warn('[BroadcastChannel] Failed to postMessage:', err);
    }
  }
}

export function subscribeToEvent<T>(event: string, callback: (payload: T) => void): () => void {
  const cleanups: Array<() => void> = [];

  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__) {
    const unsub = window.__ELECTRON_OVERLAY__.on('overlay_event', (data: { event: string; payload: T }) => {
      if (data?.event === event) {
        callback(data.payload);
      }
    });
    cleanups.push(unsub);
  } else if (channel) {
    const listener = (msg: MessageEvent) => {
      if (msg.data?.event === event) {
        callback(msg.data.payload);
      }
    };
    channel.addEventListener('message', listener);
    cleanups.push(() => channel.removeEventListener('message', listener));
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

export function openDesktopSettingsWindow() {
  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__) {
    window.__ELECTRON_OVERLAY__.send('open_settings_window');
    window.__ELECTRON_OVERLAY__.send('overlay_event', { event: 'open_settings_window' });
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
  return { success: false, error: 'Opening folder in system file manager is available in the Desktop overlay.' };
}

export async function getCameraTelemetry(): Promise<any[]> {
  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__?.invoke) {
    try {
      return (await window.__ELECTRON_OVERLAY__.invoke('get_camera_telemetry')) || [];
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

const exportedDirectories = new Set<string>();

export async function checkDirectoryNotEmpty(
  targetDir: string
): Promise<{ exists: boolean; notEmpty: boolean; fileCount: number }> {
  const normalized = targetDir.trim().replace(/[\\/]+$/, '');
  if (!normalized) {
    return { exists: false, notEmpty: false, fileCount: 0 };
  }

  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__?.invoke) {
    try {
      const res = await window.__ELECTRON_OVERLAY__.invoke('check_directory_not_empty', normalized);
      if (res && typeof res.notEmpty === 'boolean') {
        if (res.notEmpty) {
          exportedDirectories.add(normalized);
        }
        return res;
      }
    } catch {}
  }

  if (exportedDirectories.has(normalized)) {
    return { exists: true, notEmpty: true, fileCount: 6 };
  }

  return { exists: false, notEmpty: false, fileCount: 0 };
}

export async function exportSessionPackage(
  targetDir: string,
  sessionMetadata?: unknown,
  preset: string = 'premiere_xml'
): Promise<{ success: boolean; targetDir?: string; error?: string }> {
  const normalized = targetDir.trim().replace(/[\\/]+$/, '');

  if (typeof window !== 'undefined' && window.__ELECTRON_OVERLAY__?.invoke) {
    try {
      const res = await window.__ELECTRON_OVERLAY__.invoke('export_session_package', {
        targetDir,
        sessionMetadata,
        preset,
      });
      if (res?.success) {
        exportedDirectories.add(normalized);
      }
      return res;
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 600));
  exportedDirectories.add(normalized);
  return { success: true, targetDir };
}

function mockCommandResponse<T>(cmd: string, _args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case 'start_recording':
      return Promise.resolve({ success: true, session_id: `session_${Date.now()}` } as unknown as T);
    case 'pause_recording':
      return Promise.resolve({ success: true, is_paused: true } as unknown as T);
    case 'resume_recording':
      return Promise.resolve({ success: true, is_paused: false } as unknown as T);
    case 'stop_recording':
      return Promise.resolve({
        success: true,
        metadata: {
          id: `session_${Date.now()}`,
          created_at: new Date().toISOString(),
          duration_ms: 15000,
          screen_track: '/videos/sample_screen.mp4',
          camera_raw_track: '/videos/sample_camera_raw.mp4',
          mic_track: '/videos/audio_mic.wav',
          sys_audio_track: '/videos/audio_sys.wav',
          telemetry_file: '/videos/telemetry.json',
        },
      } as unknown as T);
    case 'get_audio_levels':
      return Promise.resolve({
        micRms: 0.35,
        micPeak: 0.65,
        sysRms: 0.15,
        sysPeak: 0.3,
      } as unknown as T);
    default:
      return Promise.resolve(true as unknown as T);
  }
}
