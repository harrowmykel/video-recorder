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
  const studioWidth = Math.min(1240, workArea.width - 40);
  const studioHeight = Math.min(840, workArea.height - 40);
  windows.studio = createWindow('studio', {
    title: 'Screen & Camera Studio',
    width: studioWidth,
    height: studioHeight,
    x: Math.round(workArea.x + (workArea.width - studioWidth) / 2),
    y: Math.round(workArea.y + (workArea.height - studioHeight) / 2),
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: true,
    show: false,
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
    const shouldHideCamera = Boolean(isCameraHidden || selectedCameraId === 'none');
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

    // 6. Studio Review & Export Modal visibility
    if (windows.studio && !windows.studio.isDestroyed()) {
      if (recordingState === 'review') {
        if (!windows.studio.isVisible()) {
          windows.studio.show();
          windows.studio.focus();
        }
      } else if (windows.studio.isVisible()) {
        windows.studio.hide();
      }
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
    const errMsg = await shell.openPath(targetPath);
    if (errMsg) {
      return { success: false, error: errMsg };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get_camera_telemetry', () => {
  return recordedCameraTelemetry;
});

ipcMain.handle('get_default_videos_dir', () => {
  try {
    const baseVideos = app.getPath('videos');
    const studioDir = path.join(baseVideos, 'record_studio');
    if (!fs.existsSync(studioDir)) {
      fs.mkdirSync(studioDir, { recursive: true });
    }
    return studioDir;
  } catch {
    const homeVideos = path.join(app.getPath('home'), 'Videos', 'record_studio');
    try {
      if (!fs.existsSync(homeVideos)) {
        fs.mkdirSync(homeVideos, { recursive: true });
      }
    } catch {}
    return homeVideos;
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

ipcMain.handle('delete_session', async (_event, sessionId) => {
  if (!sessionId) return { success: false, error: 'Session ID required' };
  try {
    const baseVideos = app.getPath('videos');
    const sessionDir = path.join(baseVideos, 'record_studio', 'sessions', sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      return { success: true };
    }
    const homeVideos = path.join(app.getPath('home'), 'Videos', 'record_studio', 'sessions', sessionId);
    if (fs.existsSync(homeVideos)) {
      fs.rmSync(homeVideos, { recursive: true, force: true });
      return { success: true };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function readNdjsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

ipcMain.handle('export_session_package', async (_event, { targetDir, sessionMetadata, preset = 'premiere_xml' }) => {
  try {
    fs.mkdirSync(targetDir, { recursive: true });

    // Determine source directory
    const sourceDir =
      sessionMetadata && sessionMetadata.sessionDir
        ? sessionMetadata.sessionDir
        : sessionMetadata && sessionMetadata.outputDir
          ? sessionMetadata.outputDir
          : sessionMetadata && sessionMetadata.screenPath
            ? path.dirname(sessionMetadata.screenPath)
            : null;

    if (sourceDir && fs.existsSync(sourceDir) && path.resolve(sourceDir) !== path.resolve(targetDir)) {
      // 1. Copy chunks directory if present
      const sourceChunksDir = path.join(sourceDir, 'chunks');
      const targetChunksDir = path.join(targetDir, 'chunks');
      if (fs.existsSync(sourceChunksDir)) {
        fs.mkdirSync(targetChunksDir, { recursive: true });
        const chunkFiles = fs.readdirSync(sourceChunksDir);
        for (const cf of chunkFiles) {
          const srcCf = path.join(sourceChunksDir, cf);
          const destCf = path.join(targetChunksDir, cf);
          if (fs.existsSync(srcCf)) {
            try {
              fs.copyFileSync(srcCf, destCf);
            } catch {}
          }
        }
      }

      // 2. Copy manifest and media files
      const manifestAndMedia = [
        'screen_manifest.ndjson',
        'camera_manifest.ndjson',
        'mic_manifest.ndjson',
        'sys_audio_manifest.ndjson',
        'session_metadata.json',
        'screen_clean.mp4',
        'camera_raw.mp4',
        'camera_alpha.webm',
        'audio_mic.wav',
        'audio_system.wav',
        'metadata.json',
      ];
      for (const fileName of manifestAndMedia) {
        const srcFile = path.join(sourceDir, fileName);
        const destFile = path.join(targetDir, fileName);
        if (fs.existsSync(srcFile)) {
          try {
            fs.copyFileSync(srcFile, destFile);
          } catch (copyErr) {
            console.warn(`[Export] Could not copy ${fileName}:`, copyErr);
          }
        }
      }
    }

    // Read manifests if available for chunk-based non-linear timeline export
    const readBase = sourceDir && fs.existsSync(sourceDir) ? sourceDir : targetDir;
    const screenChunks = readNdjsonLines(path.join(readBase, 'screen_manifest.ndjson'));
    const cameraChunks = readNdjsonLines(path.join(readBase, 'camera_manifest.ndjson'));
    const micChunks = readNdjsonLines(path.join(readBase, 'mic_manifest.ndjson'));
    const sysChunks = readNdjsonLines(path.join(readBase, 'sys_audio_manifest.ndjson'));

    const telemetry = (sessionMetadata && sessionMetadata.cameraTelemetry && sessionMetadata.cameraTelemetry.length)
      ? sessionMetadata.cameraTelemetry
      : recordedCameraTelemetry;

    const initialPoint = telemetry[0] || {
      normX: 0.82,
      normY: 0.72,
      width: 288,
      height: 288,
      shape: 'circle',
      hidden: false
    };

    // 1. Write package_manifest.json
    const manifestPath = path.join(targetDir, 'package_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      preset,
      exportedAt: new Date().toISOString(),
      session: sessionMetadata || {},
      cameraInitialPosition: initialPoint,
      telemetrySampleCount: telemetry.length,
      chunks: {
        screenCount: screenChunks.length,
        cameraCount: cameraChunks.length,
        micCount: micChunks.length,
        sysCount: sysChunks.length,
      }
    }, null, 2));

    // 2. Write telemetry_camera.json & telemetry.json
    fs.writeFileSync(path.join(targetDir, 'telemetry_camera.json'), JSON.stringify(telemetry, null, 2));
    fs.writeFileSync(path.join(targetDir, 'telemetry.json'), JSON.stringify({
      cameraTrajectory: telemetry,
      cursorTelemetry: [],
      deviceDisplay: screen.getPrimaryDisplay().bounds,
    }, null, 2));

    // Check if camera track was recorded in this session
    const hasCameraFile =
      cameraChunks.length > 0 ||
      fs.existsSync(path.join(targetDir, 'camera_raw.mp4')) ||
      fs.existsSync(path.join(targetDir, 'camera_alpha.webm')) ||
      Boolean(
        sessionMetadata &&
        sessionMetadata.cameraRawPath &&
        sessionMetadata.cameraRawPath.trim().length > 0 &&
        fs.existsSync(sessionMetadata.cameraRawPath)
      );

    // 3. Generate Premiere Pro XML (XMEML with Chunks or Unified Fallback)
    let screenXmlTrack = '';
    if (screenChunks.length > 0) {
      screenXmlTrack = `
            <track>
              <!-- Video Track 1: Clean Screen Recording Chunks -->
              ${screenChunks.map((c, i) => {
                const durFrames = Math.max(1, Math.round(((c.duration_ms || 15000) / 1000) * 60));
                const startFrame = Math.round(((c.start_ms || 0) / 1000) * 60);
                const endFrame = startFrame + durFrames;
                const fileName = path.basename(c.file);
                return `<clipitem id="clipitem-screen-${i+1}">
                <name>${fileName}</name>
                <duration>${durFrames}</duration>
                <rate><timebase>60</timebase></rate>
                <start>${startFrame}</start>
                <end>${endFrame}</end>
                <file id="file-screen-${i+1}">
                  <name>${fileName}</name>
                  <pathurl>file://${c.file}</pathurl>
                </file>
              </clipitem>`;
              }).join('\n              ')}
            </track>`;
    } else {
      screenXmlTrack = `
            <track>
              <!-- Video Track 1: Clean Screen Recording -->
              <clipitem id="clipitem-screen">
                <name>screen_clean.mp4</name>
                <duration>2520</duration>
                <rate><timebase>60</timebase></rate>
                <file id="file-screen">
                  <name>screen_clean.mp4</name>
                  <pathurl>file://screen_clean.mp4</pathurl>
                </file>
              </clipitem>
            </track>`;
    }

    let cameraXmlTrack = '';
    if (cameraChunks.length > 0) {
      cameraXmlTrack = `
            <track>
              <!-- Video Track 2: Decoupled Camera Chunks with Per-Chunk Telemetry -->
              ${cameraChunks.map((c, i) => {
                const durFrames = Math.max(1, Math.round(((c.duration_ms || 15000) / 1000) * 60));
                const startFrame = Math.round(((c.start_ms || 0) / 1000) * 60);
                const endFrame = startFrame + durFrames;
                const fileName = path.basename(c.file);
                const width = c.bubble?.width || 240;
                const height = c.bubble?.height || 240;
                const normX = c.position?.norm_x ?? 0.8;
                const normY = c.position?.norm_y ?? 0.7;
                const pScale = Number(((width / 1920) * 100).toFixed(2));
                const pCenterX = Number((normX - 0.5 + (width / (1920 * 2))).toFixed(4));
                const pCenterY = Number((normY - 0.5 + (height / (1080 * 2))).toFixed(4));

                return `<clipitem id="clipitem-camera-${i+1}">
                <name>${fileName}</name>
                <duration>${durFrames}</duration>
                <rate><timebase>60</timebase></rate>
                <start>${startFrame}</start>
                <end>${endFrame}</end>
                <file id="file-camera-${i+1}">
                  <name>${fileName}</name>
                  <pathurl>file://${c.file}</pathurl>
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
              </clipitem>`;
              }).join('\n              ')}
            </track>`;
    } else if (hasCameraFile) {
      const pScale = Number((((initialPoint.width || 288) / 1920) * 100).toFixed(2));
      const pCenterX = Number(((initialPoint.normX || 0.8) - 0.5 + ((initialPoint.width || 288) / (1920 * 2))).toFixed(4));
      const pCenterY = Number(((initialPoint.normY || 0.7) - 0.5 + ((initialPoint.height || 288) / (1080 * 2))).toFixed(4));
      cameraXmlTrack = `
            <track>
              <clipitem id="clipitem-camera">
                <name>camera_alpha.webm</name>
                <duration>2520</duration>
                <rate><timebase>60</timebase></rate>
                <file id="file-camera">
                  <name>camera_alpha.webm</name>
                  <pathurl>file://camera_alpha.webm</pathurl>
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

    let micXmlTrack = '';
    if (micChunks.length > 0) {
      micXmlTrack = `
            <track>
              <!-- Audio Track 1: Microphone Stem Chunks -->
              ${micChunks.map((c, i) => {
                const durFrames = Math.max(1, Math.round(((c.duration_ms || 15000) / 1000) * 60));
                const startFrame = Math.round(((c.start_ms || 0) / 1000) * 60);
                const endFrame = startFrame + durFrames;
                const fileName = path.basename(c.file);
                return `<clipitem id="clipitem-mic-${i+1}">
                <name>${fileName}</name>
                <duration>${durFrames}</duration>
                <start>${startFrame}</start>
                <end>${endFrame}</end>
                <file id="file-mic-${i+1}"><pathurl>file://${c.file}</pathurl></file>
              </clipitem>`;
              }).join('\n              ')}
            </track>`;
    } else {
      micXmlTrack = `
            <track>
              <clipitem id="clipitem-mic">
                <name>audio_mic.wav</name>
                <file id="file-mic"><pathurl>file://audio_mic.wav</pathurl></file>
              </clipitem>
            </track>`;
    }

    let sysXmlTrack = '';
    if (sysChunks.length > 0) {
      sysXmlTrack = `
            <track>
              <!-- Audio Track 2: System Audio Stem Chunks -->
              ${sysChunks.map((c, i) => {
                const durFrames = Math.max(1, Math.round(((c.duration_ms || 15000) / 1000) * 60));
                const startFrame = Math.round(((c.start_ms || 0) / 1000) * 60);
                const endFrame = startFrame + durFrames;
                const fileName = path.basename(c.file);
                return `<clipitem id="clipitem-sys-${i+1}">
                <name>${fileName}</name>
                <duration>${durFrames}</duration>
                <start>${startFrame}</start>
                <end>${endFrame}</end>
                <file id="file-sys-${i+1}"><pathurl>file://${c.file}</pathurl></file>
              </clipitem>`;
              }).join('\n              ')}
            </track>`;
    } else {
      sysXmlTrack = `
            <track>
              <clipitem id="clipitem-sys">
                <name>audio_system.wav</name>
                <file id="file-sys"><pathurl>file://audio_system.wav</pathurl></file>
              </clipitem>
            </track>`;
    }

    const xmlPath = path.join(targetDir, 'project_sync.xml');
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

    // 4. Generate CapCut Draft Package: draft_content.json + draft_meta_info.json
    const capcutVideos = [];
    const capcutAudios = [];
    const capcutScreenSegments = [];
    const capcutCameraSegments = [];
    const capcutMicSegments = [];
    const capcutSysSegments = [];

    if (screenChunks.length > 0) {
      screenChunks.forEach((c, idx) => {
        const matId = `mat_screen_${idx}`;
        const durUs = (c.duration_ms || 15000) * 1000;
        const startUs = (c.start_ms || 0) * 1000;
        capcutVideos.push({
          id: matId,
          path: c.file,
          type: 'video',
          width: c.resolution?.width || 1920,
          height: c.resolution?.height || 1080,
          duration: durUs,
        });
        capcutScreenSegments.push({
          id: `seg_screen_${idx}`,
          material_id: matId,
          target_timerange: { duration: durUs, start: startUs },
          source_timerange: { duration: durUs, start: 0 },
        });
      });
    } else {
      capcutVideos.push({
        id: 'mat_screen_0',
        path: 'screen_clean.mp4',
        type: 'video',
        width: 1920,
        height: 1080,
        duration: 42000000
      });
      capcutScreenSegments.push({
        id: 'seg_screen',
        material_id: 'mat_screen_0',
        target_timerange: { duration: 42000000, start: 0 },
        source_timerange: { duration: 42000000, start: 0 }
      });
    }

    if (cameraChunks.length > 0) {
      cameraChunks.forEach((c, idx) => {
        const matId = `mat_camera_${idx}`;
        const durUs = (c.duration_ms || 15000) * 1000;
        const startUs = (c.start_ms || 0) * 1000;
        const width = c.bubble?.width || 240;
        const normX = c.position?.norm_x ?? 0.8;
        const normY = c.position?.norm_y ?? 0.7;
        const cX = Number(((normX - 0.5) * 2).toFixed(4));
        const cY = Number((-((normY - 0.5) * 2)).toFixed(4));
        const cScale = Number((width / 1920).toFixed(4));

        capcutVideos.push({
          id: matId,
          path: c.file,
          type: 'video',
          width: 1280,
          height: 720,
          duration: durUs,
        });
        capcutCameraSegments.push({
          id: `seg_camera_${idx}`,
          material_id: matId,
          target_timerange: { duration: durUs, start: startUs },
          source_timerange: { duration: durUs, start: 0 },
          clip: {
            transform: { x: cX, y: cY },
            scale: { x: cScale, y: cScale },
          }
        });
      });
    } else if (hasCameraFile) {
      const cX = Number((((initialPoint.normX || 0.8) - 0.5) * 2).toFixed(4));
      const cY = Number((-((initialPoint.normY || 0.7) - 0.5) * 2).toFixed(4));
      const cScale = Number(((initialPoint.width || 288) / 1920).toFixed(4));
      capcutVideos.push({
        id: 'mat_camera_1',
        path: 'camera_raw.mp4',
        type: 'video',
        width: 1280,
        height: 720,
        duration: 42000000
      });
      capcutCameraSegments.push({
        id: 'seg_camera',
        material_id: 'mat_camera_1',
        target_timerange: { duration: 42000000, start: 0 },
        source_timerange: { duration: 42000000, start: 0 },
        clip: {
          transform: { x: cX, y: cY },
          scale: { x: cScale, y: cScale }
        }
      });
    }

    if (micChunks.length > 0) {
      micChunks.forEach((c, idx) => {
        const matId = `mat_mic_${idx}`;
        const durUs = (c.duration_ms || 15000) * 1000;
        const startUs = (c.start_ms || 0) * 1000;
        capcutAudios.push({ id: matId, path: c.file, type: 'audio', duration: durUs });
        capcutMicSegments.push({
          id: `seg_mic_${idx}`,
          material_id: matId,
          target_timerange: { duration: durUs, start: startUs },
          source_timerange: { duration: durUs, start: 0 },
        });
      });
    } else {
      capcutAudios.push({ id: 'mat_mic_audio', path: 'audio_mic.wav', type: 'audio', duration: 42000000 });
      capcutMicSegments.push({
        id: 'seg_mic',
        material_id: 'mat_mic_audio',
        target_timerange: { duration: 42000000, start: 0 },
        source_timerange: { duration: 42000000, start: 0 }
      });
    }

    if (sysChunks.length > 0) {
      sysChunks.forEach((c, idx) => {
        const matId = `mat_sys_${idx}`;
        const durUs = (c.duration_ms || 15000) * 1000;
        const startUs = (c.start_ms || 0) * 1000;
        capcutAudios.push({ id: matId, path: c.file, type: 'audio', duration: durUs });
        capcutSysSegments.push({
          id: `seg_sys_${idx}`,
          material_id: matId,
          target_timerange: { duration: durUs, start: startUs },
          source_timerange: { duration: durUs, start: 0 },
        });
      });
    } else {
      capcutAudios.push({ id: 'mat_sys_audio', path: 'audio_system.wav', type: 'audio', duration: 42000000 });
      capcutSysSegments.push({
        id: 'seg_sys',
        material_id: 'mat_sys_audio',
        target_timerange: { duration: 42000000, start: 0 },
        source_timerange: { duration: 42000000, start: 0 }
      });
    }

    const capcutTracks = [
      { id: 'track_screen_main', type: 'video', segments: capcutScreenSegments },
    ];
    if (capcutCameraSegments.length > 0) {
      capcutTracks.push({ id: 'track_camera_pip', type: 'video', segments: capcutCameraSegments });
    }
    capcutTracks.push(
      { id: 'track_mic_audio', type: 'audio', segments: capcutMicSegments },
      { id: 'track_sys_audio', type: 'audio', segments: capcutSysSegments },
    );

    const totalDurUs = screenChunks.reduce((acc, c) => acc + (c.duration_ms || 15000) * 1000, 0) || 42000000;

    const capcutDraftContent = {
      canvas_config: { height: 1080, ratio: 'original', width: 1920 },
      color_space: 0,
      duration: totalDurUs,
      fps: 60.0,
      materials: {
        videos: capcutVideos,
        audios: capcutAudios,
      },
      tracks: capcutTracks
    };

    const capcutDraftMeta = {
      draft_id: sessionMetadata?.sessionId || sessionMetadata?.id || `draft_${Date.now()}`,
      draft_name: `ScreenStudio_${sessionMetadata?.sessionId || sessionMetadata?.id || 'Session'}`,
      draft_root_path: targetDir,
      tm_draft_create: Date.now() * 1000,
      tm_draft_modified: Date.now() * 1000,
      draft_timeline_materials_size: capcutVideos.length + capcutAudios.length,
    };

    fs.writeFileSync(path.join(targetDir, 'draft_content.json'), JSON.stringify(capcutDraftContent, null, 2));
    fs.writeFileSync(path.join(targetDir, 'draft_meta_info.json'), JSON.stringify(capcutDraftMeta, null, 2));

    const capcutReadme = `CapCut Studio Project Instructions:
1. To open in CapCut Desktop:
   - You can copy this folder into your CapCut Drafts folder:
     • Windows: %LOCALAPPDATA%\\CapCut\\User Data\\Projects\\com.lveditor.draft\\
     • Mac: ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/
   - Or drag the media chunks directly into CapCut.
2. The project contains synchronized multi-track segments for Screen, Camera PiP, and Audio Stems.
`;
    fs.writeFileSync(path.join(targetDir, 'CAPCUT_README.txt'), capcutReadme);

    return { success: true, targetDir };
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
