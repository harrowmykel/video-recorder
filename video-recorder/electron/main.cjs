const { app, BrowserWindow, ipcMain, screen, globalShortcut, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let daemonProcess = null;

function startDaemonIfAvailable() {
  const possiblePaths = [
    path.join(process.resourcesPath || '', 'bin/recorder-daemon'),
    path.join(__dirname, '../src-daemon/target/release/recorder-daemon'),
    path.join(__dirname, '../src-daemon/target/debug/recorder-daemon'),
  ];

  for (const binPath of possiblePaths) {
    if (fs.existsSync(binPath)) {
      try {
        daemonProcess = spawn(binPath, [], {
          stdio: 'ignore',
          detached: false,
          env: { ...process.env, RUST_BACKTRACE: '1' },
        });
        break;
      } catch (err) {
        console.warn('[Electron] Could not launch daemon binary:', err);
      }
    }
  }
}

// Enable transparent visuals on Linux X11 / Wayland compositors
app.commandLine.appendSwitch('enable-transparent-visuals');
app.commandLine.appendSwitch('no-sandbox');

const DEV_URL = process.env.VITE_DEV_URL || '';

let windows = {
  toolbar: null,
  camera: null,
  countdown: null,
  annotations: null,
  area: null,
  studio: null,
  settings: null,
};

let isDockedToCamera = false;

function getPackagedFileUrl(windowName) {
  return `file://${path.join(__dirname, '../dist/index.html')}?window=${windowName}`;
}

function getWindowUrl(windowName) {
  const distIndex = path.join(__dirname, '../dist/index.html');
  if (DEV_URL) {
    return `${DEV_URL}/?window=${windowName}`;
  }
  if (fs.existsSync(distIndex)) {
    return getPackagedFileUrl(windowName);
  }
  return `http://localhost:1420/?window=${windowName}`;
}

function createWindow(label, options) {
  const win = new BrowserWindow({
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
    ...options,
  });

  if (options.alwaysOnTop) {
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  if (options.excludeFromCapture) {
    try {
      win.setContentProtection(true);
    } catch {}
  }

  const targetUrl = getWindowUrl(label);
  win.loadURL(targetUrl);

  win.webContents.on('did-fail-load', (_event, _errorCode, _errorDescription, validatedURL) => {
    const fallbackUrl = getPackagedFileUrl(label);
    if (validatedURL && !validatedURL.startsWith('file://') && fs.existsSync(path.join(__dirname, '../dist/index.html'))) {
      win.loadURL(fallbackUrl);
    }
  });

  win.on('closed', () => {
    windows[label] = null;
  });

  return win;
}

function openOrFocusSettingsWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  if (windows.settings && !windows.settings.isDestroyed()) {
    if (windows.settings.isMinimized()) {
      windows.settings.restore();
    }
    windows.settings.show();
    windows.settings.focus();
    return;
  }
  const settingsWidth = Math.min(1260, workArea.width - 48);
  const settingsHeight = Math.min(860, workArea.height - 48);
  windows.settings = createWindow('settings', {
    title: 'Record Studio Settings & Workspace',
    frame: true,
    transparent: false,
    hasShadow: true,
    resizable: true,
    width: settingsWidth,
    height: settingsHeight,
    x: Math.round(workArea.x + (workArea.width - settingsWidth) / 2),
    y: Math.round(workArea.y + (workArea.height - settingsHeight) / 2),
    alwaysOnTop: false,
    skipTaskbar: false,
    show: true,
  });
}

function snapToolbarToCamera() {
  if (!windows.toolbar || !windows.camera) return;
  const camBounds = windows.camera.getBounds();
  const tbBounds = windows.toolbar.getBounds();
  const targetX = Math.round(camBounds.x + (camBounds.width - tbBounds.width) / 2);
  const targetY = Math.round(camBounds.y + camBounds.height + 8);
  windows.toolbar.setPosition(targetX, targetY);
}

function createOverlayWindows() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const fullBounds = primaryDisplay.bounds;

  // 0. Open Settings & Devices Window by default on startup
  openOrFocusSettingsWindow();

  // 1. Floating Toolbar Pill (Bottom-Center)
  const tbWidth = 760;
  const tbHeight = 84;
  windows.toolbar = createWindow('toolbar', {
    title: 'Recorder Controls',
    width: tbWidth,
    height: tbHeight,
    x: Math.round(workArea.x + (workArea.width - tbWidth) / 2),
    y: Math.round(workArea.y + workArea.height - tbHeight - 28),
    alwaysOnTop: true,
    excludeFromCapture: true,
    skipTaskbar: false,
    show: true,
  });

  // 2. Floating Camera Bubble (Bottom-Right)
  const camWidth = 288;
  const camHeight = 350;
  windows.camera = createWindow('camera', {
    title: 'Camera Overlay',
    width: camWidth,
    height: camHeight,
    x: Math.round(workArea.x + workArea.width - camWidth - 36),
    y: Math.round(workArea.y + workArea.height - camHeight - 80),
    alwaysOnTop: true,
    excludeFromCapture: true,
    skipTaskbar: true,
    show: true,
  });

  // 3. Fullscreen Countdown Overlay (Hidden initially)
  windows.countdown = createWindow('countdown', {
    title: 'Recording Countdown',
    x: fullBounds.x,
    y: fullBounds.y,
    width: fullBounds.width,
    height: fullBounds.height,
    alwaysOnTop: true,
    excludeFromCapture: true,
    skipTaskbar: true,
    show: false,
  });

  // 4. Fullscreen Annotation Canvas Overlay (Hidden initially)
  windows.annotations = createWindow('annotations', {
    title: 'Screen Annotations',
    x: fullBounds.x,
    y: fullBounds.y,
    width: fullBounds.width,
    height: fullBounds.height,
    alwaysOnTop: true,
    excludeFromCapture: true,
    skipTaskbar: true,
    show: false,
  });

  // 5. Fullscreen Interactive Area Selector Overlay (Hidden initially)
  windows.area = createWindow('area', {
    title: 'Select Capture Area',
    x: fullBounds.x,
    y: fullBounds.y,
    width: fullBounds.width,
    height: fullBounds.height,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
  });

let isQuitting = false;
app.on('before-quit', () => {
  isQuitting = true;
});

function openOrFocusStudioWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const studioWidth = Math.min(1280, workArea.width - 40);
  const studioHeight = Math.min(880, workArea.height - 40);

  if (windows.studio && !windows.studio.isDestroyed()) {
    if (windows.studio.isMinimized()) {
      windows.studio.restore();
    }
    windows.studio.show();
    windows.studio.focus();
    return;
  }

  windows.studio = createWindow('studio', {
    title: 'Screen Studio - Review & Export',
    width: studioWidth,
    height: studioHeight,
    x: Math.round(workArea.x + (workArea.width - studioWidth) / 2),
    y: Math.round(workArea.y + (workArea.height - studioHeight) / 2),
    frame: true,
    transparent: false,
    hasShadow: true,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    show: true,
  });

  windows.studio.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      windows.studio.hide();
      Object.values(windows).forEach((win) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('overlay_event', {
            event: 'sync_state',
            payload: { recordingState: 'idle' },
          });
        }
      });
    }
  });
}

  // 6. Studio Review & Export Window (Hidden until recording finishes or opened)
  const studioWidth = Math.min(1280, workArea.width - 40);
  const studioHeight = Math.min(880, workArea.height - 40);
  windows.studio = createWindow('studio', {
    title: 'Screen Studio - Review & Export',
    width: studioWidth,
    height: studioHeight,
    x: Math.round(workArea.x + (workArea.width - studioWidth) / 2),
    y: Math.round(workArea.y + (workArea.height - studioHeight) / 2),
    frame: true,
    transparent: false,
    hasShadow: true,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    show: false,
  });

  windows.studio.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      windows.studio.hide();
      Object.values(windows).forEach((win) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('overlay_event', {
            event: 'sync_state',
            payload: { recordingState: 'idle' },
          });
        }
      });
    }
  });
}

function registerGlobalShortcuts() {
  const shortcuts = [
    { accel: 'CommandOrControl+Shift+R', action: 'record' },
    { accel: 'CommandOrControl+Shift+Space', action: 'pause' },
    { accel: 'CommandOrControl+Shift+H', action: 'camera' },
    { accel: 'CommandOrControl+Shift+Z', action: 'zoom' },
    { accel: 'CommandOrControl+Shift+A', action: 'annotation' },
  ];

  shortcuts.forEach(({ accel, action }) => {
    try {
      globalShortcut.register(accel, () => {
        if (windows.toolbar && !windows.toolbar.isDestroyed()) {
          windows.toolbar.webContents.send('overlay_event', {
            event: 'global_shortcut',
            payload: { action },
          });
        }
      });
    } catch (e) {
      console.warn(`[Overlay] Could not register shortcut ${accel}:`, e);
    }
  });
}

let activeRecordingStartTime = 0;
let isActivelyRecording = false;
let recordedCameraTelemetry = [];

function sampleCameraTelemetry() {
  if (!isActivelyRecording || !windows.camera || windows.camera.isDestroyed()) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const screenBounds = primaryDisplay.bounds;
  const camBounds = windows.camera.getBounds();
  const timeMs = Date.now() - activeRecordingStartTime;

  recordedCameraTelemetry.push({
    timeMs,
    x: camBounds.x,
    y: camBounds.y,
    normX: Number((camBounds.x / (screenBounds.width || 1)).toFixed(4)),
    normY: Number((camBounds.y / (screenBounds.height || 1)).toFixed(4)),
    width: camBounds.width,
    height: camBounds.height,
    shape: 'circle',
    hidden: !windows.camera.isVisible(),
  });
}

ipcMain.on('move_window', (_event, { windowLabel, dx, dy }) => {
  const win = windows[windowLabel];
  if (!win || win.isDestroyed()) return;

  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));

  if (windowLabel === 'camera') {
    sampleCameraTelemetry();
  }

  // If satellite docking is active and the camera bubble moves, move the toolbar with it
  if (windowLabel === 'camera' && isDockedToCamera && windows.toolbar && !windows.toolbar.isDestroyed()) {
    const [tbX, tbY] = windows.toolbar.getPosition();
    windows.toolbar.setPosition(Math.round(tbX + dx), Math.round(tbY + dy));
  }
});

ipcMain.on('resize_window', (_event, { windowLabel, width, height }) => {
  const win = windows[windowLabel];
  if (!win || win.isDestroyed()) return;

  const bounds = win.getBounds();
  if (bounds.width === width && bounds.height === height) return;

  // Keep window horizontally centered around its previous center point.
  // For the toolbar, keep the bottom edge anchored so popovers grow upward.
  const newX = Math.round(bounds.x + (bounds.width - width) / 2);
  const newY =
    windowLabel === 'toolbar'
      ? Math.round(bounds.y + (bounds.height - height))
      : Math.round(bounds.y + (bounds.height - height) / 2);
  win.setBounds({ x: newX, y: newY, width: Math.round(width), height: Math.round(height) });

  if (windowLabel === 'camera') {
    sampleCameraTelemetry();
  }

  if (windowLabel === 'camera' && isDockedToCamera) {
    snapToolbarToCamera();
  }
});

ipcMain.on('open_settings_window', () => {
  openOrFocusSettingsWindow();
});

ipcMain.on('overlay_event', (senderEvent, data) => {
  if (!data || !data.event) return;

  if (data.event === 'open_settings_window') {
    openOrFocusSettingsWindow();
    return;
  }

  // Broadcast to all other windows
  Object.values(windows).forEach((win) => {
    if (win && !win.isDestroyed() && win.webContents !== senderEvent.sender) {
      win.webContents.send('overlay_event', data);
    }
  });

  if (data.event === 'sync_state' && data.payload) {
    const {
      recordingState,
      isCameraHidden,
      selectedCameraId,
      isDockedToCamera: docked,
      isAnnotationActive,
      isAreaSelectorOpen,
    } = data.payload;

    // Track active recording for camera telemetry
    if (recordingState === 'recording' && !isActivelyRecording) {
      isActivelyRecording = true;
      activeRecordingStartTime = Date.now();
      recordedCameraTelemetry = [];
      sampleCameraTelemetry();
    } else if (recordingState && recordingState !== 'recording' && isActivelyRecording) {
      isActivelyRecording = false;
      sampleCameraTelemetry();
    }

    // 1. Camera visibility
    const autoHide = Boolean(data.payload.autoHideCameraOnRecord && recordingState === 'recording');
    const shouldHideCamera = Boolean(isCameraHidden || selectedCameraId === 'none' || autoHide);
    if (windows.camera && !windows.camera.isDestroyed()) {
      if (shouldHideCamera && windows.camera.isVisible()) {
        windows.camera.hide();
      } else if (!shouldHideCamera && !windows.camera.isVisible()) {
        windows.camera.showInactive();
      }
    }

    // 2. Satellite docking
    if (typeof docked === 'boolean' && docked !== isDockedToCamera) {
      isDockedToCamera = docked;
      if (isDockedToCamera) {
        snapToolbarToCamera();
      } else if (windows.toolbar && !windows.toolbar.isDestroyed()) {
        const workArea = screen.getPrimaryDisplay().workArea;
        const tbBounds = windows.toolbar.getBounds();
        windows.toolbar.setPosition(
          Math.round(workArea.x + (workArea.width - tbBounds.width) / 2),
          Math.round(workArea.y + workArea.height - tbBounds.height - 28)
        );
      }
    }

    // 3. Countdown overlay visibility
    if (windows.countdown && !windows.countdown.isDestroyed()) {
      if (recordingState === 'countdown') {
        if (!windows.countdown.isVisible()) {
          windows.countdown.show();
          windows.countdown.focus();
        }
      } else if (windows.countdown.isVisible()) {
        windows.countdown.hide();
      }
    }

    // 4. Annotation canvas overlay visibility
    if (typeof isAnnotationActive === 'boolean' && windows.annotations && !windows.annotations.isDestroyed()) {
      if (isAnnotationActive) {
        if (!windows.annotations.isVisible()) {
          windows.annotations.show();
          windows.annotations.focus();
        }
      } else if (windows.annotations.isVisible()) {
        windows.annotations.hide();
      }
    }

    // 5. Interactive Area Selector overlay visibility
    if (typeof isAreaSelectorOpen === 'boolean' && windows.area && !windows.area.isDestroyed()) {
      if (isAreaSelectorOpen) {
        if (!windows.area.isVisible()) {
          windows.area.show();
          windows.area.focus();
        }
      } else if (windows.area.isVisible()) {
        windows.area.hide();
      }
    }

    // 6. Studio Review & Export Window visibility
    if (recordingState === 'review') {
      openOrFocusStudioWindow();
    } else if (windows.studio && !windows.studio.isDestroyed() && windows.studio.isVisible()) {
      windows.studio.hide();
    }
  }
});

ipcMain.on('quit_app', () => {
  app.quit();
});

ipcMain.handle('select_directory', async (_event, defaultPath) => {
  const primaryWin = windows.studio || windows.toolbar || null;
  const result = await dialog.showOpenDialog(primaryWin, {
    title: 'Choose Export Destination Directory',
    defaultPath: defaultPath || app.getPath('videos'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('open_path', async (_event, targetPath) => {
  if (!targetPath) return { success: false, error: 'Target path required' };
  try {
    const resolved = targetPath.startsWith('~/')
      ? path.join(app.getPath('home'), targetPath.slice(2))
      : targetPath;
    const errMsg = await shell.openPath(resolved);
    if (errMsg) {
      return { success: false, error: errMsg };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('reveal_in_folder', async (_event, filePath) => {
  if (!filePath) return { success: false, error: 'Target path required' };
  try {
    const resolved = filePath.startsWith('~/')
      ? path.join(app.getPath('home'), filePath.slice(2))
      : filePath;
    shell.showItemInFolder(resolved);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('select_video_files', async () => {
  const primaryWin = windows.studio || windows.toolbar || null;
  const result = await dialog.showOpenDialog(primaryWin, {
    title: 'Select Video Files for Background Removal',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) {
    return [];
  }
  return result.filePaths;
});

ipcMain.handle('save_dropped_file', async (_event, { fileName, buffer }) => {
  const targetDir = getStudioSubDir('bg-remover');
  const destPath = path.join(targetDir, fileName);
  await fs.promises.writeFile(destPath, Buffer.from(buffer));
  return destPath;
});

ipcMain.handle('get_camera_telemetry', () => {
  return recordedCameraTelemetry;
});

function getStudioAppDataDir() {
  try {
    const baseVideos = app.getPath('videos');
    const studioDir = path.join(baseVideos, 'studio');
    if (!fs.existsSync(studioDir)) {
      fs.mkdirSync(studioDir, { recursive: true });
    }
    return studioDir;
  } catch {
    const homeStudio = path.join(app.getPath('home'), 'Videos', 'studio');
    try {
      if (!fs.existsSync(homeStudio)) {
        fs.mkdirSync(homeStudio, { recursive: true });
      }
    } catch {}
    return homeStudio;
  }
}

function getStudioSubDir(sub) {
  const dir = path.join(getStudioAppDataDir(), sub);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return dir;
}

ipcMain.handle('get_app_data_dir', () => {
  return getStudioAppDataDir();
});

ipcMain.handle('get_default_videos_dir', () => {
  return getStudioSubDir('projects');
});

ipcMain.handle('get_default_exports_dir', () => {
  return getStudioSubDir('exports');
});

ipcMain.handle('get_default_bg_remover_dir', () => {
  return getStudioSubDir('bg-remover');
});

ipcMain.handle('check_directory_not_empty', (_event, targetDir) => {
  if (!targetDir) return { exists: false, notEmpty: false, fileCount: 0 };
  try {
    const resolved = targetDir.startsWith('~/')
      ? path.join(app.getPath('home'), targetDir.slice(2))
      : targetDir;
    if (!fs.existsSync(resolved)) {
      return { exists: false, notEmpty: false, fileCount: 0 };
    }
    const entries = fs.readdirSync(resolved);
    return { exists: true, notEmpty: entries.length > 0, fileCount: entries.length };
  } catch {
    return { exists: false, notEmpty: false, fileCount: 0 };
  }
});

ipcMain.handle('list_sessions', async () => {
  const sessions = [];
  const baseVideos = app.getPath('videos');
  const candidateDirs = [
    path.join(baseVideos, 'studio', 'projects'),
    path.join(app.getPath('home'), 'Videos', 'studio', 'projects'),
  ];

  const seenIds = new Set();

  for (const baseDir of candidateDirs) {
    if (!fs.existsSync(baseDir)) continue;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const sessionId = ent.name;
        if (seenIds.has(sessionId)) continue;

        const sessionDir = path.join(baseDir, sessionId);
        const metaFile = path.join(sessionDir, 'metadata.json');
        let meta = null;
        if (fs.existsSync(metaFile)) {
          try {
            meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
          } catch {}
        }

        let chunkCount = meta?.chunk_count || 0;
        const chunksDir = path.join(sessionDir, 'chunks');
        if (fs.existsSync(chunksDir)) {
          try {
            chunkCount = fs.readdirSync(chunksDir).length;
          } catch {}
        }

        const stat = fs.statSync(sessionDir);
        const createdAt =
          meta?.created_at ||
          (stat.birthtime && stat.birthtime.getTime() > 0 ? stat.birthtime.toISOString() : null) ||
          stat.mtime?.toISOString?.() ||
          new Date().toISOString();

        const screenPath = meta?.screen_track || path.join(sessionDir, 'screen_clean.mp4');
        const cameraPath = meta?.camera_raw_track || path.join(sessionDir, 'camera_raw.mp4');
        const micPath = meta?.mic_track || path.join(sessionDir, 'audio_mic.wav');
        const sysPath = meta?.sys_audio_track || path.join(sessionDir, 'audio_system.wav');
        const telemetryPath = meta?.telemetry_file || path.join(sessionDir, 'telemetry.json');

        seenIds.add(sessionId);
        sessions.push({
          id: sessionId,
          created_at: createdAt,
          duration_ms: meta?.duration_ms || 15000,
          session_dir: sessionDir,
          screen_track: fs.existsSync(screenPath) ? screenPath : '',
          camera_raw_track: fs.existsSync(cameraPath) ? cameraPath : '',
          mic_track: fs.existsSync(micPath) ? micPath : '',
          sys_audio_track: fs.existsSync(sysPath) ? sysPath : '',
          telemetry_file: fs.existsSync(telemetryPath) ? telemetryPath : '',
          screen_manifest: path.join(sessionDir, 'screen_manifest.ndjson'),
          camera_manifest: path.join(sessionDir, 'camera_manifest.ndjson'),
          mic_manifest: path.join(sessionDir, 'mic_manifest.ndjson'),
          sys_audio_manifest: path.join(sessionDir, 'sys_audio_manifest.ndjson'),
          chunk_count: chunkCount,
          status: meta?.status || 'completed',
        });
      }
    } catch (err) {
      console.warn('[list_sessions] Error reading directory:', baseDir, err);
    }
  }

  sessions.sort((a, b) => (b.created_at || b.id).localeCompare(a.created_at || a.id));
  return { sessions };
});

ipcMain.handle('delete_session', async (_event, sessionId) => {
  if (!sessionId) return { success: false, error: 'Session ID required' };
  try {
    const baseVideos = app.getPath('videos');
    const candidateDirs = [
      path.join(baseVideos, 'studio', 'projects', sessionId),
      path.join(app.getPath('home'), 'Videos', 'studio', 'projects', sessionId),
    ];
    let deleted = false;
    for (const dir of candidateDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        deleted = true;
      }
    }
    return { success: true, deleted };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export_session_package', async (_event, { targetDir, sessionMetadata, preset = 'premiere_xml' }) => {
  try {
    const resolvedTargetDir = targetDir.startsWith('~/')
      ? path.join(app.getPath('home'), targetDir.slice(2))
      : targetDir;
    fs.mkdirSync(resolvedTargetDir, { recursive: true });

    // Determine source directory
    const rawSourceDir =
      sessionMetadata && sessionMetadata.sessionDir
        ? sessionMetadata.sessionDir
        : sessionMetadata && sessionMetadata.outputDir
          ? sessionMetadata.outputDir
          : sessionMetadata && sessionMetadata.screenPath
            ? path.dirname(sessionMetadata.screenPath)
            : null;

    const sourceDir = rawSourceDir && rawSourceDir.startsWith('~/')
      ? path.join(app.getPath('home'), rawSourceDir.slice(2))
      : rawSourceDir;

    // Only copy clean finalized media files (do not copy internal chunks/ or daemon manifests)
    const mediaTracks = [
      { name: 'screen_clean.mp4', explicit: sessionMetadata?.screenPath },
      { name: 'camera_raw.mp4', explicit: sessionMetadata?.cameraRawPath },
      { name: 'camera_alpha.webm', explicit: sessionMetadata?.cameraAlphaPath },
      { name: 'audio_mic.wav', explicit: sessionMetadata?.micAudioPath },
      { name: 'audio_system.wav', explicit: sessionMetadata?.sysAudioPath },
    ];

    for (const track of mediaTracks) {
      const destFile = path.join(resolvedTargetDir, track.name);
      if (fs.existsSync(destFile)) continue;

      let src = null;
      if (track.explicit && fs.existsSync(track.explicit)) {
        src = track.explicit;
      } else if (sourceDir) {
        const candidate = path.join(sourceDir, track.name);
        if (fs.existsSync(candidate)) {
          src = candidate;
        }
      }

      if (src && path.resolve(src) !== path.resolve(destFile)) {
        try {
          fs.copyFileSync(src, destFile);
        } catch (copyErr) {
          console.warn(`[Export] Could not copy ${track.name}:`, copyErr);
        }
      }
    }

    const hasScreenFile = fs.existsSync(path.join(resolvedTargetDir, 'screen_clean.mp4'));
    const hasCameraAlpha = fs.existsSync(path.join(resolvedTargetDir, 'camera_alpha.webm'));
    const hasCameraRaw = fs.existsSync(path.join(resolvedTargetDir, 'camera_raw.mp4'));
    const hasCameraFile = hasCameraAlpha || hasCameraRaw;
    const hasMicFile = fs.existsSync(path.join(resolvedTargetDir, 'audio_mic.wav'));
    const hasSysAudioFile = fs.existsSync(path.join(resolvedTargetDir, 'audio_system.wav'));

    const durMs = sessionMetadata?.durationMs || sessionMetadata?.duration_ms || 15000;
    const durSec = durMs / 1000;
    const durFrames = Math.max(1, Math.round(durSec * 60));
    const durUs = Math.round(durSec * 1000000);

    const telemetry = (sessionMetadata && sessionMetadata.cameraTelemetry && sessionMetadata.cameraTelemetry.length)
      ? sessionMetadata.cameraTelemetry
      : recordedCameraTelemetry;

    const initialPoint = telemetry[0] || {
      normX: 0.82,
      normY: 0.72,
      width: 288,
      height: 288,
      shape: 'circle',
      hidden: false,
    };

    // 1. Write package_manifest.json with summary of included tracks
    const manifestPath = path.join(resolvedTargetDir, 'package_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      preset,
      exportedAt: new Date().toISOString(),
      session: {
        id: sessionMetadata?.sessionId || sessionMetadata?.id || 'session',
        durationMs: durMs,
      },
      tracks: {
        screen: hasScreenFile ? 'screen_clean.mp4' : null,
        camera: hasCameraAlpha ? 'camera_alpha.webm' : (hasCameraRaw ? 'camera_raw.mp4' : null),
        mic: hasMicFile ? 'audio_mic.wav' : null,
        sysAudio: hasSysAudioFile ? 'audio_system.wav' : null,
      },
      cameraInitialPosition: hasCameraFile ? initialPoint : null,
      telemetrySampleCount: hasCameraFile ? telemetry.length : 0,
    }, null, 2));

    // 2. Preset-specific project files
    if (preset === 'premiere_xml') {
      if (hasCameraFile && telemetry.length > 0) {
        fs.writeFileSync(path.join(resolvedTargetDir, 'telemetry_camera.json'), JSON.stringify(telemetry, null, 2));
      }

      const screenXmlTrack = hasScreenFile ? `
            <track>
              <!-- Video Track 1: Clean Screen Recording -->
              <clipitem id="clipitem-screen">
                <name>screen_clean.mp4</name>
                <duration>${durFrames}</duration>
                <rate><timebase>60</timebase></rate>
                <start>0</start>
                <end>${durFrames}</end>
                <file id="file-screen">
                  <name>screen_clean.mp4</name>
                  <pathurl>file://screen_clean.mp4</pathurl>
                </file>
              </clipitem>
            </track>` : '';

      let cameraXmlTrack = '';
      if (hasCameraFile) {
        const camFile = hasCameraAlpha ? 'camera_alpha.webm' : 'camera_raw.mp4';
        const pScale = Number((((initialPoint.width || 288) / 1920) * 100).toFixed(2));
        const pCenterX = Number(((initialPoint.normX || 0.8) - 0.5 + ((initialPoint.width || 288) / (1920 * 2))).toFixed(4));
        const pCenterY = Number(((initialPoint.normY || 0.7) - 0.5 + ((initialPoint.height || 288) / (1080 * 2))).toFixed(4));
        cameraXmlTrack = `
            <track>
              <!-- Video Track 2: Camera PIP -->
              <clipitem id="clipitem-camera">
                <name>${camFile}</name>
                <duration>${durFrames}</duration>
                <rate><timebase>60</timebase></rate>
                <start>0</start>
                <end>${durFrames}</end>
                <file id="file-camera">
                  <name>${camFile}</name>
                  <pathurl>file://${camFile}</pathurl>
                </file>
                <filter>
                  <effect>
                    <name>Basic Motion</name>
                    <effectid>basic</effectid>
                    <effectcategory>motion</effectcategory>
                    <parameter><parameterid>scale</parameterid><name>Scale</name><value>${pScale}</value></parameter>
                    <parameter><parameterid>center</parameterid><name>Center</name><value><horiz>${pCenterX}</horiz><vert>${pCenterY}</vert></value></parameter>
                  </effect>
                </filter>
              </clipitem>
            </track>`;
      }

      const micXmlTrack = hasMicFile ? `
            <track>
              <!-- Audio Track 1: Microphone Stem -->
              <clipitem id="clipitem-mic">
                <name>audio_mic.wav</name>
                <duration>${durFrames}</duration>
                <start>0</start>
                <end>${durFrames}</end>
                <file id="file-mic"><pathurl>file://audio_mic.wav</pathurl></file>
              </clipitem>
            </track>` : '';

      const sysXmlTrack = hasSysAudioFile ? `
            <track>
              <!-- Audio Track 2: System Audio Stem -->
              <clipitem id="clipitem-sys">
                <name>audio_system.wav</name>
                <duration>${durFrames}</duration>
                <start>0</start>
                <end>${durFrames}</end>
                <file id="file-sys"><pathurl>file://audio_system.wav</pathurl></file>
              </clipitem>
            </track>` : '';

      const xmlPath = path.join(resolvedTargetDir, 'project_sync.xml');
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <project>
    <name>Studio Sync Package</name>
    <children>
      <sequence id="sequence-1">
        <name>Synchronized Recording</name>
        <rate><timebase>60</timebase></rate>
        <media>
          <video>${screenXmlTrack}${cameraXmlTrack}
          </video>
          <audio>${micXmlTrack}${sysXmlTrack}
          </audio>
        </media>
      </sequence>
    </children>
  </project>
</xmeml>`;
      fs.writeFileSync(xmlPath, xmlContent);
    } else if (preset === 'capcut_draft') {
      const capcutVideos = [];
      const capcutAudios = [];
      const capcutScreenSegments = [];
      const capcutCameraSegments = [];
      const capcutMicSegments = [];
      const capcutSysSegments = [];

      if (hasScreenFile) {
        capcutVideos.push({
          id: 'mat_screen_0',
          path: 'screen_clean.mp4',
          type: 'video',
          width: 1920,
          height: 1080,
          duration: durUs,
        });
        capcutScreenSegments.push({
          id: 'seg_screen',
          material_id: 'mat_screen_0',
          target_timerange: { duration: durUs, start: 0 },
          source_timerange: { duration: durUs, start: 0 },
        });
      }

      if (hasCameraFile) {
        const camFile = hasCameraAlpha ? 'camera_alpha.webm' : 'camera_raw.mp4';
        const cX = Number((((initialPoint.normX || 0.8) - 0.5) * 2).toFixed(4));
        const cY = Number((-((initialPoint.normY || 0.7) - 0.5) * 2).toFixed(4));
        const cScale = Number(((initialPoint.width || 288) / 1920).toFixed(4));
        capcutVideos.push({
          id: 'mat_camera_1',
          path: camFile,
          type: 'video',
          width: 1280,
          height: 720,
          duration: durUs,
        });
        capcutCameraSegments.push({
          id: 'seg_camera',
          material_id: 'mat_camera_1',
          target_timerange: { duration: durUs, start: 0 },
          source_timerange: { duration: durUs, start: 0 },
          clip: {
            transform: { x: cX, y: cY },
            scale: { x: cScale, y: cScale },
          },
        });
      }

      if (hasMicFile) {
        capcutAudios.push({ id: 'mat_mic_audio', path: 'audio_mic.wav', type: 'audio', duration: durUs });
        capcutMicSegments.push({
          id: 'seg_mic',
          material_id: 'mat_mic_audio',
          target_timerange: { duration: durUs, start: 0 },
          source_timerange: { duration: durUs, start: 0 },
        });
      }

      if (hasSysAudioFile) {
        capcutAudios.push({ id: 'mat_sys_audio', path: 'audio_system.wav', type: 'audio', duration: durUs });
        capcutSysSegments.push({
          id: 'seg_sys',
          material_id: 'mat_sys_audio',
          target_timerange: { duration: durUs, start: 0 },
          source_timerange: { duration: durUs, start: 0 },
        });
      }

      const capcutTracks = [];
      if (capcutScreenSegments.length > 0) {
        capcutTracks.push({ id: 'track_screen_main', type: 'video', segments: capcutScreenSegments });
      }
      if (capcutCameraSegments.length > 0) {
        capcutTracks.push({ id: 'track_camera_pip', type: 'video', segments: capcutCameraSegments });
      }
      if (capcutMicSegments.length > 0) {
        capcutTracks.push({ id: 'track_mic_audio', type: 'audio', segments: capcutMicSegments });
      }
      if (capcutSysSegments.length > 0) {
        capcutTracks.push({ id: 'track_sys_audio', type: 'audio', segments: capcutSysSegments });
      }

      const capcutDraftContent = {
        canvas_config: { height: 1080, ratio: 'original', width: 1920 },
        color_space: 0,
        duration: durUs,
        fps: 60.0,
        materials: {
          videos: capcutVideos,
          audios: capcutAudios,
        },
        tracks: capcutTracks,
      };

      const capcutDraftMeta = {
        draft_id: sessionMetadata?.sessionId || sessionMetadata?.id || `draft_${Date.now()}`,
        draft_name: `ScreenStudio_${sessionMetadata?.sessionId || sessionMetadata?.id || 'Session'}`,
        draft_root_path: resolvedTargetDir,
        tm_draft_create: Date.now() * 1000,
        tm_draft_modified: Date.now() * 1000,
        draft_timeline_materials_size: capcutVideos.length + capcutAudios.length,
      };

      fs.writeFileSync(path.join(resolvedTargetDir, 'draft_content.json'), JSON.stringify(capcutDraftContent, null, 2));
      fs.writeFileSync(path.join(resolvedTargetDir, 'draft_meta_info.json'), JSON.stringify(capcutDraftMeta, null, 2));

      const capcutReadme = `CapCut Studio Project Instructions:
1. To open in CapCut Desktop:
   - You can copy this folder into your CapCut Drafts folder:
     • Windows: %LOCALAPPDATA%\\CapCut\\User Data\\Projects\\com.lveditor.draft\\
     • Mac: ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/
   - Or drag the media files directly into CapCut.
2. The project contains synchronized multi-track segments for Screen, Camera PiP, and Audio Stems.
`;
      fs.writeFileSync(path.join(resolvedTargetDir, 'CAPCUT_README.txt'), capcutReadme);
    } else if (preset === 'mp4_bundle') {
      if (hasCameraFile && telemetry.length > 0) {
        fs.writeFileSync(path.join(resolvedTargetDir, 'telemetry_camera.json'), JSON.stringify(telemetry, null, 2));
      }
    }

    return { success: true, targetDir: resolvedTargetDir };
  } catch (err) {
    console.error('Failed to export package:', err);
    return { success: false, error: err.message };
  }
});


app.whenReady().then(() => {
  // Ensure background capture daemon is running
  startDaemonIfAvailable();
  // Short delay on Linux so X11/Wayland compositor initializes alpha visual cleanly
  setTimeout(() => {
    createOverlayWindows();
    registerGlobalShortcuts();
  }, 200);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (daemonProcess && !daemonProcess.killed) {
    try {
      daemonProcess.kill('SIGTERM');
    } catch {}
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
