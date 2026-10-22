const { app, BrowserWindow, ipcMain, screen, globalShortcut, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { registerSessionExportHandler } = require('./sessionExporter.cjs');


let daemonProcess = null;

function getBundledFfmpegPath() {
  const exeExt = process.platform === 'win32' ? '.exe' : '';
  const possiblePaths = [
    path.join(process.resourcesPath || '', `bin/ffmpeg${exeExt}`),
    path.join(__dirname, `../bin/ffmpeg${exeExt}`),
    path.join(__dirname, `../node_modules/ffmpeg-static/ffmpeg${exeExt}`),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function startDaemonIfAvailable() {
  const exeExt = process.platform === 'win32' ? '.exe' : '';
  const possiblePaths = [
    path.join(process.resourcesPath || '', `bin/recorder-daemon${exeExt}`),
    path.join(__dirname, `../src-daemon/target/release/recorder-daemon${exeExt}`),
    path.join(__dirname, `../src-daemon/target/debug/recorder-daemon${exeExt}`),
  ];

  const ffmpegPath = getBundledFfmpegPath();
  const userDataDir = app.getPath('userData');
  const cacheDir = path.join(userDataDir, '.cache');
  const daemonEnv = {
    ...process.env,
    RUST_BACKTRACE: '1',
    STUDIO_USER_DATA_DIR: userDataDir,
    STUDIO_CACHE_DIR: cacheDir,
  };
  if (ffmpegPath) {
    daemonEnv.FFMPEG_PATH = ffmpegPath;
    const ffmpegDir = path.dirname(ffmpegPath);
    const pathKey = Object.keys(daemonEnv).find((k) => k.toLowerCase() === 'path') || 'PATH';
    daemonEnv[pathKey] = `${ffmpegDir}${path.delimiter}${daemonEnv[pathKey] || ''}`;
  }

  for (const binPath of possiblePaths) {
    if (fs.existsSync(binPath)) {
      try {
        daemonProcess = spawn(binPath, [], {
          stdio: 'ignore',
          detached: false,
          env: daemonEnv,
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
  notes: null,
};

let activeSessionId = null;
let activeSessionDir = null;
let isDockedToCamera = false;
let isQuitting = false;

app.on('before-quit', () => {
  isQuitting = true;
});

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
    } catch { }
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

function openOrFocusNotesWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  if (windows.notes && !windows.notes.isDestroyed()) {
    if (windows.notes.isMinimized()) {
      windows.notes.restore();
    }
    windows.notes.show();
    windows.notes.focus();
    return;
  }
  const notesWidth = 560;
  const notesHeight = 680;
  const posX = Math.round(workArea.x + workArea.width - notesWidth - 36);
  const posY = Math.round(workArea.y + 48);

  windows.notes = createWindow('notes', {
    title: 'Session Notes',
    frame: true,
    transparent: false,
    hasShadow: true,
    resizable: true,
    width: notesWidth,
    height: notesHeight,
    x: posX,
    y: posY,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: true,
  });

  windows.notes.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      windows.notes.hide();
    }
  });
}

function openOrFocusStudioWindow(show = true, sessionId = null) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const studioWidth = Math.min(1280, workArea.width - 40);
  const studioHeight = Math.min(880, workArea.height - 40);

  if (windows.studio && !windows.studio.isDestroyed()) {
    if (show) {
      if (windows.studio.isMinimized()) {
        windows.studio.restore();
      }
      windows.studio.show();
      windows.studio.focus();
    }
    if (sessionId) {
      windows.studio.webContents.send('overlay_event', {
        event: 'select_session',
        payload: { sessionId },
      });
    }
    return windows.studio;
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
    show,
  });

  if (sessionId) {
    windows.studio.webContents.once('did-finish-load', () => {
      if (windows.studio && !windows.studio.isDestroyed()) {
        windows.studio.webContents.send('overlay_event', {
          event: 'select_session',
          payload: { sessionId },
        });
      }
    });
  }

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

  return windows.studio;
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
  const tbWidth = 860;
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

  // 6. Studio Review & Export Window (Hidden until recording finishes or opened)
  openOrFocusStudioWindow(false);
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

ipcMain.on('open_studio_window', (_event, data) => {
  const sessionId = data?.sessionId || (typeof data === 'string' ? data : null);
  openOrFocusStudioWindow(true, sessionId);
});

ipcMain.on('close_studio_window', () => {
  if (windows.studio && !windows.studio.isDestroyed() && windows.studio.isVisible()) {
    windows.studio.hide();
  }
});

ipcMain.on('open_notes_window', () => {
  openOrFocusNotesWindow();
});

ipcMain.on('toggle_notes_window', () => {
  if (windows.notes && !windows.notes.isDestroyed() && windows.notes.isVisible()) {
    windows.notes.hide();
  } else {
    openOrFocusNotesWindow();
  }
});

ipcMain.on('overlay_event', (senderEvent, data) => {
  if (!data || !data.event) return;

  if (data.event === 'open_settings_window') {
    openOrFocusSettingsWindow();
    return;
  }

  if (data.event === 'open_studio_window') {
    const sessionId = data.payload?.sessionId || null;
    openOrFocusStudioWindow(true, sessionId);
    return;
  }

  if (data.event === 'close_studio_window') {
    if (windows.studio && !windows.studio.isDestroyed() && windows.studio.isVisible()) {
      windows.studio.hide();
    }
    return;
  }

  if (data.event === 'open_notes_window') {
    openOrFocusNotesWindow();
    return;
  }

  if (data.event === 'toggle_notes_window') {
    if (windows.notes && !windows.notes.isDestroyed() && windows.notes.isVisible()) {
      windows.notes.hide();
    } else {
      openOrFocusNotesWindow();
    }
    return;
  }

  if (data.event === 'session_started' && data.payload?.sessionId) {
    activeSessionId = data.payload.sessionId;
    activeSessionDir = path.join(getStudioSubDir('projects'), activeSessionId);
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

ipcMain.handle('get_active_session_info', () => {
  const currentDir = activeSessionDir || (activeSessionId ? path.join(getStudioSubDir('projects'), activeSessionId) : path.join(getStudioSubDir('projects'), 'draft_notes'));
  return {
    sessionId: activeSessionId,
    sessionDir: currentDir,
    isRecording: isActivelyRecording,
  };
});

ipcMain.handle('load_session_notes', async (_event, payload = {}) => {
  try {
    const targetSessionId = payload?.sessionId || activeSessionId;
    let targetDir = payload?.sessionDir;
    if (!targetDir) {
      if (targetSessionId) {
        targetDir = path.join(getStudioSubDir('projects'), targetSessionId);
      } else {
        targetDir = path.join(getStudioSubDir('projects'), 'draft_notes');
      }
    }
    const resolvedDir = targetDir.startsWith('~/')
      ? path.join(app.getPath('home'), targetDir.slice(2))
      : targetDir;
    const filePath = path.join(resolvedDir, 'notes.md');
    if (fs.existsSync(filePath)) {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return { success: true, content, filePath, sessionId: targetSessionId, exists: true };
    }
    return { success: true, content: '', filePath, sessionId: targetSessionId, exists: false };
  } catch (err) {
    return { success: false, error: err.message, content: '', exists: false };
  }
});

ipcMain.handle('save_session_notes', async (_event, { sessionId, sessionDir, content = '' }) => {
  try {
    const targetSessionId = sessionId || activeSessionId;
    let targetDir = sessionDir;
    if (!targetDir) {
      if (targetSessionId) {
        targetDir = path.join(getStudioSubDir('projects'), targetSessionId);
      } else {
        targetDir = path.join(getStudioSubDir('projects'), 'draft_notes');
      }
    }
    const resolvedDir = targetDir.startsWith('~/')
      ? path.join(app.getPath('home'), targetDir.slice(2))
      : targetDir;
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }
    const filePath = path.join(resolvedDir, 'notes.md');
    await fs.promises.writeFile(filePath, content, 'utf8');

    // Also update metadata.json if present in this session folder
    const metaPath = path.join(resolvedDir, 'metadata.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
        meta.notes_file = 'notes.md';
        meta.has_notes = Boolean(content.trim());
        await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
      } catch { }
    }

    return { success: true, filePath, sessionId: targetSessionId, savedAt: Date.now() };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
  let destPath = path.join(targetDir, fileName);
  const parsed = path.parse(fileName);
  let counter = 1;
  while (fs.existsSync(destPath)) {
    destPath = path.join(targetDir, `${parsed.name} (${counter})${parsed.ext}`);
    counter++;
  }
  await fs.promises.writeFile(destPath, Buffer.from(buffer));
  return destPath;
});

ipcMain.handle('read_file_buffer', async (_event, filePath) => {
  try {
    const buffer = await fs.promises.readFile(filePath);
    return { success: true, buffer };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
    } catch { }
    return homeStudio;
  }
}

function getStudioSubDir(sub) {
  const dir = path.join(getStudioAppDataDir(), sub);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch { }
  }
  return dir;
}

function getStudioBgImagesDir() {
  const dir = path.join(app.getPath('userData'), 'bg-images');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch { }
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

ipcMain.handle('get_default_bg_images_dir', () => {
  return getStudioBgImagesDir();
});

function getImageMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.svg': return 'image/svg+xml';
    case '.gif': return 'image/gif';
    case '.bmp': return 'image/bmp';
    case '.avif': return 'image/avif';
    default: return 'application/octet-stream';
  }
}

ipcMain.handle('list_bg_images', async () => {
  try {
    const bgDir = getStudioBgImagesDir();
    const entries = await fs.promises.readdir(bgDir, { withFileTypes: true });
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.bmp', '.avif']);
    const results = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!imageExtensions.has(ext)) continue;

      const fullPath = path.join(bgDir, entry.name);
      try {
        const stats = await fs.promises.stat(fullPath);
        const fileBuf = await fs.promises.readFile(fullPath);
        const mime = getImageMimeType(entry.name);
        const dataUrl = `data:${mime};base64,${fileBuf.toString('base64')}`;
        results.push({
          id: entry.name,
          name: entry.name,
          filePath: fullPath,
          dataUrl,
          mtime: stats.mtimeMs,
        });
      } catch (fileErr) {
        console.warn(`[list_bg_images] Could not read ${entry.name}:`, fileErr);
      }
    }

    results.sort((a, b) => b.mtime - a.mtime);
    return { success: true, images: results };
  } catch (err) {
    console.error('Failed to list background images:', err);
    return { success: false, images: [], error: err.message };
  }
});

ipcMain.handle('save_bg_image', async (_event, { sourcePath, fileName, buffer }) => {
  try {
    const bgDir = getStudioBgImagesDir();
    let targetFileName = fileName || (sourcePath ? path.basename(sourcePath) : `bg_${Date.now()}.png`);
    // Sanitize filename
    targetFileName = targetFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const destPath = path.join(bgDir, targetFileName);

    if (sourcePath) {
      const resolvedSource = sourcePath.startsWith('~/')
        ? path.join(app.getPath('home'), sourcePath.slice(2))
        : sourcePath;

      // If source file is already inside the bg-images folder, avoid redundant copy
      if (path.resolve(resolvedSource) === path.resolve(destPath)) {
        const stats = await fs.promises.stat(destPath);
        const fileBuf = await fs.promises.readFile(destPath);
        const mime = getImageMimeType(destPath);
        return {
          success: true,
          image: {
            id: targetFileName,
            name: targetFileName,
            filePath: destPath,
            dataUrl: `data:${mime};base64,${fileBuf.toString('base64')}`,
            mtime: stats.mtimeMs,
          },
        };
      }

      await fs.promises.copyFile(resolvedSource, destPath);
    } else if (buffer) {
      await fs.promises.writeFile(destPath, Buffer.from(buffer));
    } else {
      return { success: false, error: 'No sourcePath or buffer provided' };
    }

    const stats = await fs.promises.stat(destPath);
    const fileBuf = await fs.promises.readFile(destPath);
    const mime = getImageMimeType(destPath);

    return {
      success: true,
      image: {
        id: targetFileName,
        name: targetFileName,
        filePath: destPath,
        dataUrl: `data:${mime};base64,${fileBuf.toString('base64')}`,
        mtime: stats.mtimeMs,
      },
    };
  } catch (err) {
    console.error('Failed to save background image:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete_bg_image', async (_event, target) => {
  try {
    const bgDir = getStudioBgImagesDir();
    const fileName = typeof target === 'string' ? path.basename(target) : path.basename(target?.fileName || '');
    if (!fileName) return { success: false, error: 'Invalid filename' };

    const destPath = path.join(bgDir, fileName);
    if (fs.existsSync(destPath)) {
      await fs.promises.unlink(destPath);
      return { success: true, deleted: true, fileName };
    }
    return { success: true, deleted: false };
  } catch (err) {
    console.error('Failed to delete background image:', err);
    return { success: false, error: err.message };
  }
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
          } catch { }
        }

        let chunkCount = meta?.chunk_count || 0;
        const chunksDir = path.join(sessionDir, 'chunks');
        if (fs.existsSync(chunksDir)) {
          try {
            chunkCount = fs.readdirSync(chunksDir).length;
          } catch { }
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
        const notesPath = path.join(sessionDir, 'notes.md');

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
          notes_file: fs.existsSync(notesPath) ? notesPath : '',
          has_notes: fs.existsSync(notesPath),
          screen_manifest: path.join(sessionDir, 'screen_manifest.ndjson'),
          camera_manifest: path.join(sessionDir, 'camera_manifest.ndjson'),
          mic_manifest: path.join(sessionDir, 'mic_manifest.ndjson'),
          sys_audio_manifest: path.join(sessionDir, 'sys_audio_manifest.ndjson'),
          chunk_count: chunkCount,
          chunk_duration_sec: meta?.chunk_duration_sec || 15,
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

registerSessionExportHandler(ipcMain, {
  getRecordedCameraTelemetry: () => recordedCameraTelemetry,
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
    } catch { }
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
