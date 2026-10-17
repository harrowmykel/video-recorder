const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
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

const DEV_URL = process.env.VITE_DEV_URL || 'http://localhost:1420';
const isDev = !app.isPackaged;

let windows = {
  toolbar: null,
  camera: null,
  countdown: null,
  annotations: null,
  studio: null,
};

let isDockedToCamera = false;

function getWindowUrl(windowName) {
  if (isDev) {
    return `${DEV_URL}/?window=${windowName}`;
  }
  return `file://${path.join(__dirname, '../dist/index.html')}?window=${windowName}`;
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
    },
    ...options,
  });

  if (options.alwaysOnTop) {
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  win.loadURL(getWindowUrl(label));
  win.on('closed', () => {
    windows[label] = null;
  });

  return win;
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

  // 1. Floating Toolbar Pill (Bottom-Center)
  const tbWidth = 640;
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
  const camSize = 288;
  windows.camera = createWindow('camera', {
    title: 'Camera Overlay',
    width: camSize,
    height: camSize,
    x: Math.round(workArea.x + workArea.width - camSize - 36),
    y: Math.round(workArea.y + workArea.height - camSize - 120),
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

  // 5. Studio Review & Export Window (Hidden until recording finishes or opened)
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

ipcMain.on('move_window', (_event, { windowLabel, dx, dy }) => {
  const win = windows[windowLabel];
  if (!win || win.isDestroyed()) return;

  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));

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

  // Keep window centered around its previous center point
  const newX = Math.round(bounds.x + (bounds.width - width) / 2);
  const newY = Math.round(bounds.y + (bounds.height - height) / 2);
  win.setBounds({ x: newX, y: newY, width: Math.round(width), height: Math.round(height) });

  if (windowLabel === 'camera' && isDockedToCamera) {
    snapToolbarToCamera();
  }
});

ipcMain.on('overlay_event', (senderEvent, data) => {
  if (!data || !data.event) return;

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
    } = data.payload;

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

    // 5. Studio Review & Export Modal visibility
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

app.whenReady().then(() => {
  // If packaged, ensure background capture daemon is running
  if (!isDev) {
    startDaemonIfAvailable();
  }
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
