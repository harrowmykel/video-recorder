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
    alwaysOnTop: true,
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
    if (typeof isCameraHidden === 'boolean' && windows.camera && !windows.camera.isDestroyed()) {
      if (isCameraHidden && windows.camera.isVisible()) {
        windows.camera.hide();
      } else if (!isCameraHidden && !windows.camera.isVisible()) {
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

ipcMain.handle('export_session_package', async (_event, { targetDir, sessionMetadata, preset = 'premiere_xml' }) => {
  try {
    fs.mkdirSync(targetDir, { recursive: true });

    // Copy recorded media files from session outputDir (or screenPath dirname) if available and distinct from targetDir
    const sourceDir =
      sessionMetadata && sessionMetadata.outputDir
        ? sessionMetadata.outputDir
        : sessionMetadata && sessionMetadata.screenPath
          ? path.dirname(sessionMetadata.screenPath)
          : null;
    if (sourceDir && fs.existsSync(sourceDir) && path.resolve(sourceDir) !== path.resolve(targetDir)) {
      const mediaFiles = [
        'screen_clean.mp4',
        'camera_raw.mp4',
        'camera_alpha.webm',
        'audio_mic.wav',
        'audio_system.wav',
        'metadata.json',
      ];
      for (const fileName of mediaFiles) {
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

    // Retrieve camera telemetry from metadata or recorded telemetry in main process
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
    }, null, 2));

    // 2. Write telemetry_camera.json & telemetry.json
    fs.writeFileSync(path.join(targetDir, 'telemetry_camera.json'), JSON.stringify(telemetry, null, 2));
    fs.writeFileSync(path.join(targetDir, 'telemetry.json'), JSON.stringify({
      cameraTrajectory: telemetry,
      cursorTelemetry: [],
      deviceDisplay: screen.getPrimaryDisplay().bounds,
    }, null, 2));

    // 3. Write Premiere / DaVinci XML Sync (XMEML with Basic Motion keyframes)
    const premiereCenterX = Number(((initialPoint.normX || 0.8) - 0.5 + ((initialPoint.width || 288) / (1920 * 2))).toFixed(4));
    const premiereCenterY = Number(((initialPoint.normY || 0.7) - 0.5 + ((initialPoint.height || 288) / (1080 * 2))).toFixed(4));
    const premiereScale = Number((((initialPoint.width || 288) / 1920) * 100).toFixed(2));

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
          <video>
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
            </track>
            <track>
              <!-- Video Track 2: Decoupled Camera Feed positioned with recorded telemetry -->
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
                    <parameter>
                      <parameterid>scale</parameterid>
                      <name>Scale</name>
                      <value>${premiereScale}</value>
                    </parameter>
                    <parameter>
                      <parameterid>center</parameterid>
                      <name>Center</name>
                      <value>
                        <horiz>${premiereCenterX}</horiz>
                        <vert>${premiereCenterY}</vert>
                      </value>
                    </parameter>
                  </effect>
                </filter>
              </clipitem>
            </track>
          </video>
          <audio>
            <!-- Audio Track 1: Microphone Stem -->
            <track>
              <clipitem id="clipitem-mic">
                <name>audio_mic.wav</name>
                <file id="file-mic"><pathurl>file://audio_mic.wav</pathurl></file>
              </clipitem>
            </track>
            <!-- Audio Track 2: System Audio Stem -->
            <track>
              <clipitem id="clipitem-sys">
                <name>audio_system.wav</name>
                <file id="file-sys"><pathurl>file://audio_system.wav</pathurl></file>
              </clipitem>
            </track>
          </audio>
        </media>
      </sequence>
    </children>
  </project>
</xmeml>`;
    fs.writeFileSync(xmlPath, xmlContent);

    // 4. Write CapCut Draft Package: draft_content.json + draft_meta_info.json
    const capcutX = Number((((initialPoint.normX || 0.8) - 0.5) * 2).toFixed(4));
    const capcutY = Number((-( (initialPoint.normY || 0.7) - 0.5) * 2).toFixed(4));
    const capcutScale = Number(((initialPoint.width || 288) / 1920).toFixed(4));

    const capcutDraftContent = {
      canvas_config: { height: 1080, ratio: 'original', width: 1920 },
      color_space: 0,
      duration: 42000000,
      fps: 60.0,
      materials: {
        videos: [
          {
            id: 'mat_screen_0',
            path: 'screen_clean.mp4',
            type: 'video',
            width: 1920,
            height: 1080,
            duration: 42000000
          },
          {
            id: 'mat_camera_1',
            path: 'camera_raw.mp4',
            type: 'video',
            width: 1280,
            height: 720,
            duration: 42000000
          }
        ],
        audios: [
          {
            id: 'mat_mic_audio',
            path: 'audio_mic.wav',
            type: 'audio',
            duration: 42000000
          },
          {
            id: 'mat_sys_audio',
            path: 'audio_system.wav',
            type: 'audio',
            duration: 42000000
          }
        ]
      },
      tracks: [
        {
          id: 'track_screen_main',
          type: 'video',
          segments: [
            {
              id: 'seg_screen',
              material_id: 'mat_screen_0',
              target_timerange: { duration: 42000000, start: 0 },
              source_timerange: { duration: 42000000, start: 0 }
            }
          ]
        },
        {
          id: 'track_camera_pip',
          type: 'video',
          segments: [
            {
              id: 'seg_camera',
              material_id: 'mat_camera_1',
              target_timerange: { duration: 42000000, start: 0 },
              source_timerange: { duration: 42000000, start: 0 },
              clip: {
                transform: {
                  x: capcutX,
                  y: capcutY
                },
                scale: {
                  x: capcutScale,
                  y: capcutScale
                }
              }
            }
          ]
        },
        {
          id: 'track_mic_audio',
          type: 'audio',
          segments: [
            {
              id: 'seg_mic',
              material_id: 'mat_mic_audio',
              target_timerange: { duration: 42000000, start: 0 },
              source_timerange: { duration: 42000000, start: 0 }
            }
          ]
        },
        {
          id: 'track_sys_audio',
          type: 'audio',
          segments: [
            {
              id: 'seg_sys',
              material_id: 'mat_sys_audio',
              target_timerange: { duration: 42000000, start: 0 },
              source_timerange: { duration: 42000000, start: 0 }
            }
          ]
        }
      ]
    };

    const capcutDraftMeta = {
      draft_id: sessionMetadata?.sessionId || `draft_${Date.now()}`,
      draft_name: `ScreenStudio_${sessionMetadata?.sessionId || 'Session'}`,
      draft_root_path: targetDir,
      tm_draft_create: Date.now() * 1000,
      tm_draft_modified: Date.now() * 1000,
      draft_timeline_materials_size: 4
    };

    fs.writeFileSync(path.join(targetDir, 'draft_content.json'), JSON.stringify(capcutDraftContent, null, 2));
    fs.writeFileSync(path.join(targetDir, 'draft_meta_info.json'), JSON.stringify(capcutDraftMeta, null, 2));

    const capcutReadme = `CapCut Studio Project Instructions:
1. To open in CapCut Desktop:
   - You can copy this folder into your CapCut Drafts folder:
     • Windows: %LOCALAPPDATA%\\CapCut\\User Data\\Projects\\com.lveditor.draft\\
     • Mac: ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/
   - Or drag the media tracks (screen_clean.mp4, camera_raw.mp4, audio_mic.wav, audio_system.wav) directly into CapCut.
2. The camera PiP overlay has been pre-configured with coordinates:
   • X: ${capcutX}, Y: ${capcutY}, Scale: ${capcutScale} (derived from recorded telemetry).
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
