# Why did the project move from Tauri to Electron?

The project moved from Tauri (`src-tauri/`) to Electron (`electron/` + `src-daemon/`) for three critical reasons:

## 1. Linux Floating Transparent Overlays (Wayland & X11)
- Tauri on Linux uses **WebKitGTK** (`wry` / `tao`). 
- WebKitGTK on Linux has notorious limitations with **transparent, borderless, click-through, always-on-top floating windows**:
  - Transparent windows on WebKitGTK frequently render black rectangular bounding boxes instead of clear alpha on Linux compositors.
  - Features like `setIgnoreMouseEvents({ forward: true })` (clicking through floating controls) are unreliable or unsupported on WebKitGTK.
- Electron uses **Chromium's native compositor**, which reliably supports multi-window transparent overlays (the Floating Action Dock, the Camera Bubble, and the 3-2-1 Countdown HUD) across both X11 and Wayland (via XWayland).

## 2. Media & Hardware Audio/Video Stability
- WebKitGTK on Linux has inconsistent implementations of `getUserMedia`, WebGL offscreen contexts, and MediaRecorder APIs compared to Chromium.
- Chromium in Electron provides consistent media codecs, WebGL performance, and WebCodecs support.

## 3. Decoupled Architecture (`recorder-daemon`)
- In Tauri, if the frontend crashes or reloads (HMR during development), the entire backend process crashes with it.
- By moving to Electron + a standalone Rust daemon (`src-daemon`), the recording engine (FFmpeg, PipeWire, ALSA, AI models) runs as an independent, crash-resilient background service with port discovery (`4820`–`4840`). Even if the UI restarts, the recording daemon keeps running smoothly.